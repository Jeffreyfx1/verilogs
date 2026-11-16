import { deleteCookie, getCookie, getRequestUrl, setCookie } from "@tanstack/react-start/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";
import { freshData, isLive, normalizeData, quoteProduct, repairCatalog, serverLabel, topupQuote, withAdminLogin, applyImportSlice, type Data, type Product, type SyncReport } from "@/lib/catalog";
import { customerPrice, pricingOf, successRateOf } from "@/lib/pricing";
import { extractCatalog, slimFiveSim, fiveSimCategoryUrl, shapeImport, airtimeProductsFromPayload, MAJOR_SERVICES, type ImportKind, type ParsedItem } from "@/lib/categorize";
import { destinationOf, flattenGetaText, sourceKindOf } from "@/lib/import-source";
import { instakingCurrency, instakingPost, isInstakingHost, parseInstakingServices, readSmmDetail } from "@/lib/instaking";
import { catalogStamp, followCatalogPages, walkBrowse } from "@/lib/catalog-pages";
import { IMPORT_BATCH, importBatchCount } from "@/lib/import-batch";
import { uid } from "@/lib/money";
import { placeOnProvider } from "@/lib/fulfill.server";
import {
  clearProducts,
  countExistingProducts,
  pruneSyncedProducts,
  providerIdsWithNumbers,
  queryCatalogPage,
  queryCountries,
  queryExtras,
  queryHidden,
  queryOperators,
  queryServices,
  readProduct,
  readShopRows,
  setProductSubcategory,
  setRowsEnabled,
  lockListing,
  upsertProductRows,
} from "@/lib/product-rows.server";
import {
  addAnnouncement,
  addTicket,
  adjustBalance,
  buyProduct,
  changePassword,
  completeGoogle,
  creditVerified,
  importServices,
  loginUser,
  mailUser,
  markNotes,
  projectShop,
  refundOrder,
  registerUser,
  resetPassword,
  resetShop,
  saveFaqs,
  saveSettings,
  setAnnouncements,
  setEnabled,
  editListing,
  setProvider,
  tickWaiting,
  updateProfile,
  upsertGoogle,
  type Draft,
} from "@/lib/shop-logic";

const COOKIE = "vl_session";

type Mail = { to: string; subject: string; text: string };
type ApplyResult = { error: string | null; state: Data; report: SyncReport | null };

let writeChain: Promise<unknown> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeChain.then(fn, fn);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function cookieOpts(remember = true) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    ...(remember ? { maxAge: 60 * 60 * 24 * 30 } : {}),
    secure: (process.env.APP_URL || "").startsWith("https://"),
  };
}

function touchCookie(token: string, remember = true) {
  setCookie(COOKIE, token, cookieOpts(remember));
}

async function readSession() {
  const token = getCookie(COOKIE);
  if (!token) return { token: null as string | null, userId: null as string | null, draft: null as Draft | null };
  const sql = await getSql();
  const rows = await sql<{ user_id: string | null; draft: string | null }>`select user_id, draft from shop_sessions where token = ${token}`;
  const row = rows[0];
  if (!row) return { token, userId: null, draft: null };
  let draft: Draft | null = null;
  if (row.draft) {
    try {
      draft = JSON.parse(row.draft) as Draft;
    } catch {
      draft = null;
    }
  }
  return { token, userId: row.user_id, draft };
}

async function writeSession(token: string, userId: string | null, draft: Draft | null) {
  const sql = await getSql();
  const draftText = draft ? JSON.stringify(draft) : null;
  const existing = await sql<{ token: string }>`select token from shop_sessions where token = ${token}`;
  if (existing[0]) {
    await sql`update shop_sessions set user_id = ${userId}, draft = ${draftText} where token = ${token}`;
  } else {
    await sql`insert into shop_sessions (token, user_id, draft) values (${token}, ${userId}, ${draftText})`;
  }
}

function withoutSampleCatalog(doc: Data): Data {
  const sampleIds = new Set(
    doc.providers
      .filter((p) => /provider\.example/i.test(p.baseUrl) || ["SwiftSMS", "NovaOTP", "NaijaVTU"].includes(p.name))
      .map((p) => p.id),
  );
  const fakeWhatsapp = doc.settings.whatsapp.includes("2348000000000");
  if (!sampleIds.size && !fakeWhatsapp) return doc;
  return {
    ...doc,
    providers: doc.providers.filter((p) => !sampleIds.has(p.id)),
    products: doc.products.filter((p) => !sampleIds.has(p.providerId)),
    settings: fakeWhatsapp ? { ...doc.settings, whatsapp: "" } : doc.settings,
  };
}

async function resetImportedCataloguesOnce() {
  const sql = await getSql();
  const existing = await sql<{ id: string }>`select id from shop_catalog_backups where id = 'pre-source-reset'`;
  if (existing.length) return;
  const products = await sql`select * from shop_products`;
  const catalog = await sql<{ doc: string }>`select doc from shop_catalog where id = 'main'`;
  const stateRows = await sql<{ doc: string }>`select doc from shop_state where id = 'main'`;
  let stateProducts: unknown[] = [];
  let stripped = "";
  let preservedCounts = { users: 0, orders: 0, txns: 0 };
  if (stateRows[0]?.doc) {
    const doc = JSON.parse(stateRows[0].doc) as Data;
    stateProducts = Array.isArray(doc.products) ? doc.products : [];
    const users = Array.isArray(doc.users) ? doc.users.length : 0;
    const orders = Array.isArray(doc.orders) ? doc.orders.length : 0;
    const txns = Array.isArray(doc.txns) ? doc.txns.length : 0;
    doc.products = [];
    doc.providers = (doc.providers || []).map((provider) => ({ ...provider, lastSync: null }));
    stripped = JSON.stringify(doc);
    preservedCounts = { users, orders, txns };
  }
  const note = "Imported catalogues only. Customer accounts, wallets, orders, deposits and provider keys were not deleted.";
  const payload = JSON.stringify({
    shopProducts: products,
    shopCatalog: catalog[0]?.doc || "[]",
    stateProducts,
    preserved: preservedCounts,
  });
  try {
    await sql`insert into shop_catalog_backups (id, note, products_json, product_count) values ('pre-source-reset', ${note}, ${payload}, ${products.length + stateProducts.length})`;
  } catch {
    return;
  }
  await sql`delete from shop_products`;
  await sql`update shop_catalog set doc = '[]' where id = 'main'`;
  if (stripped) await sql`update shop_state set doc = ${stripped}, updated_at = now() where id = 'main'`;
  catalogCache = [];
}

async function loadDoc(withCatalog = false): Promise<Data> {
  await resetImportedCataloguesOnce();
  const sql = await getSql();
  const rows = await sql<{ doc: string }>`select doc from shop_state where id = 'main'`;
  if (!rows[0]) {
    const doc = freshData();
    await sql`insert into shop_state (id, doc) values ('main', ${JSON.stringify(doc)})`;
    return doc;
  }
  const parsed = normalizeData(JSON.parse(rows[0].doc) as Data);
  let doc = withAdminLogin(withoutSampleCatalog(parsed));
  const stuck = doc.products.filter(isHeavy);
  if (stuck.length) {
    const prev = await readCatalog();
    const ids = new Set(stuck.map((p) => p.id));
    const catalog = [...prev.filter((p) => !ids.has(p.id)), ...stuck];
    await writeCatalog(catalog);
    doc = { ...doc, products: doc.products.filter((p) => !isHeavy(p)) };
    await writeState(doc);
    if (withCatalog) doc = { ...doc, products: [...doc.products, ...catalog] };
  } else if (withCatalog) {
    doc = { ...doc, products: [...doc.products, ...(await readCatalog())] };
  }
  const cleaned = repairCatalog(doc);
  if (cleaned !== doc) {
    await writeState(cleaned);
    if (withCatalog) await writeCatalog(cleaned.products.filter(isHeavy));
  }
  return cleaned;
}

async function loadLight(): Promise<Data> {
  await resetImportedCataloguesOnce();
  const sql = await getSql();
  const rows = await sql<{ doc: string }>`select doc from shop_state where id = 'main'`;
  if (!rows[0]) {
    const doc = freshData();
    await sql`insert into shop_state (id, doc) values ('main', ${JSON.stringify(doc)})`;
    return doc;
  }
  const parsed = normalizeData(JSON.parse(rows[0].doc) as Data);
  const doc = withAdminLogin(withoutSampleCatalog(parsed));
  return { ...doc, products: doc.products.filter((p) => !isHeavy(p)) };
}

function isHeavy(product: Product) {
  return product.category === "numbers" || product.category === "rent" || product.category === "number" || product.category === "usa";
}

let catalogCache: Product[] | null = null;

async function readCatalog(): Promise<Product[]> {
  if (catalogCache) return catalogCache;
  const sql = await getSql();
  const rows = await sql<{ doc: string }>`select doc from shop_catalog where id = 'main'`;
  if (!rows[0]?.doc) return [];
  try {
    catalogCache = JSON.parse(rows[0].doc) as Product[];
  } catch {
    catalogCache = [];
  }
  return catalogCache;
}

async function clearNumberImports() {
  const sql = await getSql();
  try {
    await sql`delete from shop_products where category in ('numbers', 'rent') or (category = 'other' and price <= 0)`;
  } catch {
    // The products table is created by the next migration.
  }
  catalogCache = [];
  try {
    await sql`update shop_catalog set doc = '[]' where id = 'main'`;
  } catch {
    // No old catalogue blob yet.
  }
  const doc = await loadLight();
  const products = doc.products.filter((product) => product.category !== "numbers" && product.category !== "rent");
  const providers = doc.providers.map((provider) => ({ ...provider, servesNumbers: false }));
  await writeState({ ...doc, products, providers });
}

export async function clearNumberCatalog() {
  const session = await readSession();
  const doc = await loadLight();
  const me = doc.users.find((user) => user.id === session.userId);
  if (me?.role !== "admin") return { error: "Only an admin can clear the catalogue.", state: null as Data | null };
  await clearNumberImports();
  const fresh = await loadLight();
  return { error: null as string | null, state: projectShop(fresh, session.userId, session.draft) };
}

async function writeCatalog(products: Product[]) {
  const sql = await getSql();
  const text = JSON.stringify(products);
  const existing = await sql`select id from shop_catalog where id = 'main'`;
  if (existing[0]) await sql`update shop_catalog set doc = ${text}, updated_at = now() where id = 'main'`;
  else await sql`insert into shop_catalog (id, doc) values ('main', ${text})`;
  catalogCache = products;
}

async function writeState(doc: Data) {
  const sql = await getSql();
  const text = JSON.stringify({ ...doc, products: doc.products.filter((p) => !isHeavy(p)) });
  const existing = await sql`select id from shop_state where id = 'main'`;
  if (existing[0]) await sql`update shop_state set doc = ${text}, updated_at = now() where id = 'main'`;
  else await sql`insert into shop_state (id, doc) values ('main', ${text})`;
}

async function saveDoc(doc: Data, catalog = false) {
  if (!catalog) {
    await writeState(doc);
    return;
  }
  await writeCatalog(doc.products.filter(isHeavy));
  const live = await loadLight();
  await writeState({ ...live, providers: doc.providers, products: doc.products, settings: doc.settings });
}

export async function sendMail(mail: Mail | Mail[] | undefined) {
  const list = Array.isArray(mail) ? mail : mail ? [mail] : [];
  if (!list.length) return null;
  const key = process.env.RESEND_API_KEY;
  if (!key) return "Resend is not connected on the server.";
  const from = process.env.RESEND_FROM || "VeriLogs <notifications@veri-logs.com>";
  let failed = "";
  for (const item of list) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [item.to], subject: item.subject, text: item.text }),
      });
      if (!res.ok) failed = (await res.text()).slice(0, 180) || "Resend refused the email.";
    } catch {
      failed = "Could not reach Resend.";
    }
  }
  return failed || null;
}

async function rememberKey(providerId: string | undefined, apiKey: string | undefined) {
  if (!providerId || !apiKey?.trim()) return;
  const sql = await getSql();
  const rows = await sql`select provider_id from provider_keys where provider_id = ${providerId}`;
  if (rows[0]) await sql`update provider_keys set api_key = ${apiKey.trim()} where provider_id = ${providerId}`;
  else await sql`insert into provider_keys (provider_id, api_key) values (${providerId}, ${apiKey.trim()})`;
}

export async function readProviderKey(providerId: string) {
  const sql = await getSql();
  const rows = await sql<{ api_key: string }>`select api_key from provider_keys where provider_id = ${providerId}`;
  return rows[0]?.api_key || "";
}

function result(doc: Data, userId: string | null, draft: Draft | null, error: string | null, report: SyncReport | null = null): ApplyResult {
  return { error, state: projectShop(doc, userId, draft), report };
}

const LIGHT = new Set(["login", "register", "logout", "resetPassword", "completeGoogle"]);

let lightSyncedAt = 0;
const LIGHT_CATS = ["airtime", "data", "logs", "smm", "cable", "exam", "giftcard", "betting"];

export async function currentShop(): Promise<ApplyResult> {
  let doc = await loadLight();
  if (Date.now() - lightSyncedAt > 120000) {
    lightSyncedAt = Date.now();
    try {
      const ids = new Set(await providerIdsWithNumbers());
      if (ids.size) {
        let changed = false;
        const providers = doc.providers.map((provider) => {
          if (!ids.has(provider.id) || provider.servesNumbers) return provider;
          changed = true;
          return { ...provider, servesNumbers: true, enabled: provider.enabled };
        });
        if (changed) {
          doc = { ...doc, providers };
          await writeState(doc);
        }
      }
    } catch {
      // Table appears after the next deploy migration.
    }
    try {
      const rows = await readShopRows(LIGHT_CATS, 2000);
      const have = new Set(doc.products.map((product) => `${product.providerId}|${product.externalId}`));
      const missing = rows.filter((product) => product.externalId && !have.has(`${product.providerId}|${product.externalId}`));
      if (missing.length) {
        doc = { ...doc, products: [...doc.products, ...missing] };
        await writeState(doc);
      }
    } catch {
      // Catalogue table is created by the next migration.
    }
  }
  const session = await readSession();
  return result(doc, session.userId, session.draft, null);
}

export async function applyAct(op: string, payload: Record<string, unknown>): Promise<ApplyResult> {
  if (LIGHT.has(op)) return runAct(op, payload);
  return locked(() => runAct(op, payload));
}

async function runAct(op: string, payload: Record<string, unknown>): Promise<ApplyResult> {
    const heavy = op === "import";
    let doc = heavy ? await loadDoc(true) : await loadLight();
    const session = await readSession();
    let userId = session.userId;
    let draft = session.draft;
    let error: string | null = null;
    let report: SyncReport | null = null;
    let mail: Mail | Mail[] | undefined;
    const token = session.token || crypto.randomUUID();

    const str = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");
    const num = (k: string) => (typeof payload[k] === "number" ? (payload[k] as number) : Number(payload[k]));

    if (op === "register") {
      const out = await registerUser(doc, { name: str("name"), email: str("email"), phone: str("phone"), password: str("password") });
      doc = out.data;
      error = out.error;
      mail = "mail" in out ? out.mail : undefined;
      if (!error && out.userId) {
        userId = out.userId;
        draft = null;
        await writeSession(token, userId, null);
        touchCookie(token, payload.remember !== false);
      }
    } else if (op === "login") {
      const out = await loginUser(doc, str("email"), str("password"));
      error = out.error;
      if (!error && out.userId) {
        userId = out.userId;
        draft = null;
        await writeSession(token, userId, null);
        touchCookie(token, payload.remember !== false);
      }
    } else if (op === "logout") {
      userId = null;
      draft = null;
      if (session.token) {
        const sql = await getSql();
        await sql`delete from shop_sessions where token = ${session.token}`;
      }
      deleteCookie(COOKIE, { path: "/" });
    } else if (op === "completeGoogle") {
      const out = completeGoogle(doc, draft, { name: str("name"), phone: str("phone") });
      doc = out.data;
      error = out.error;
      mail = "mail" in out ? out.mail : undefined;
      if (!error && out.userId) {
        userId = out.userId;
        draft = null;
        await writeSession(token, userId, null);
        touchCookie(token);
      }
    } else if (op === "resetPassword") {
      const out = await resetPassword(doc, str("email"), str("password"));
      doc = out.data;
      error = out.error;
      mail = "mail" in out ? out.mail : undefined;
    } else if (op === "updateProfile") {
      const out = updateProfile(doc, userId, { name: str("name"), phone: str("phone") });
      doc = out.data;
      error = out.error;
    } else if (op === "changePassword") {
      const out = await changePassword(doc, userId, str("oldPw"), str("next"));
      doc = out.data;
      error = out.error;
    } else if (op === "buy") {
      const out = await completePurchase(doc, userId, str("productId"), { phone: str("phone"), amount: num("amount"), detail: str("detail") });
      doc = out.data;
      error = out.error;
    } else if (op === "refund") {
      const out = refundOrder(doc, userId, str("orderId"));
      doc = out.data;
      error = out.error;
    } else if (op === "tick") {
      doc = await syncInstakingOrders(doc);
      doc = tickWaiting(doc);
    } else if (op === "refill") {
      const out = await refillInstakingOrder(doc, userId, str("orderId"));
      doc = out.data;
      error = out.error;
    } else if (op === "setSubcategory") {
      const me = doc.users.find((user) => user.id === userId);
      if (me?.role !== "admin") error = "Only an admin can do that.";
      else {
        const name = str("subcategory").trim().slice(0, 40);
        const id = str("id");
        const saved = await setProductSubcategory(id, name);
        if (!saved) error = "That product cannot take a marketplace subcategory.";
        else doc = { ...doc, products: doc.products.map((product) => product.id === id ? { ...product, subcategory: name } : product) };
      }
    } else if (op === "import") {
      const out = importServices(doc, userId, {
        providerId: str("providerId") || undefined,
        name: str("name"),
        baseUrl: str("baseUrl"),
        currency: str("currency") === "USD" ? "USD" : "NGN",
        usdRate: num("usdRate"),
        markup: num("markup"),
        payload: payload.payload,
        hasKey: !!payload.hasKey || !!str("apiKey"),
        publish: !!payload.publish,
      });
      doc = out.data;
      error = out.error;
      report = out.report ?? null;
      if (!error && out.report && str("apiKey")) await rememberKey(out.report.providerId, str("apiKey"));
    } else if (op === "setEnabled") {
      const ids = Array.isArray(payload.ids) ? payload.ids.filter((id) => typeof id === "string") : [];
      const out = setEnabled(doc, userId, ids as string[], !!payload.enabled);
      doc = out.data;
      error = out.error;
      if (!error) await setRowsEnabled(ids as string[], !!payload.enabled);
    } else if (op === "editListing") {
      const description = typeof payload.description === "string" ? payload.description : "";
      const price = num("price");
      const out = editListing(doc, userId, str("id"), { description, price });
      doc = out.data;
      error = out.error;
      if (!error) await lockListing(str("id"), { description, price });
    } else if (op === "setProvider") {
      const patch: { enabled?: boolean; name?: string; usdRate?: number; markup?: number; markupPercent?: number; currency?: "NGN" | "USD"; operatorMarkups?: Record<string, number>; operatorPrices?: Record<string, number> } = {};
      if (typeof payload.enabled === "boolean") patch.enabled = payload.enabled;
      if (str("name")) patch.name = str("name");
      if (Number.isFinite(num("usdRate")) && num("usdRate") > 0) patch.usdRate = num("usdRate");
      if (Number.isFinite(num("markup")) && num("markup") > 0) patch.markup = num("markup");
      if (Number.isFinite(num("markupPercent")) && num("markupPercent") >= 0) patch.markupPercent = num("markupPercent");
      if (payload.currency === "USD" || payload.currency === "NGN") patch.currency = payload.currency;
      if (payload.operatorMarkups && typeof payload.operatorMarkups === "object") {
        const marks: Record<string, number> = {};
        for (const [key, value] of Object.entries(payload.operatorMarkups as Record<string, unknown>)) {
          const markup = Number(value);
          const name = key.trim().toLowerCase();
          if (name && markup > 0) marks[name] = markup;
        }
        patch.operatorMarkups = marks;
      }
      if (payload.operatorPrices && typeof payload.operatorPrices === "object") {
        const prices: Record<string, number> = {};
        for (const [key, value] of Object.entries(payload.operatorPrices as Record<string, unknown>)) {
          const price = Number(value);
          const name = key.trim().toLowerCase();
          if (name && price > 0) prices[name] = price;
        }
        patch.operatorPrices = prices;
      }
      const out = setProvider(doc, userId, str("id"), patch);
      doc = out.data;
      error = out.error;
    } else if (op === "adjustBalance") {
      const out = adjustBalance(doc, userId, str("userId"), num("amount"), str("note") || "Admin adjustment");
      doc = out.data;
      error = out.error;
      mail = "mail" in out ? out.mail : undefined;
    } else if (op === "addTicket") {
      const out = addTicket(doc, userId, { email: str("email"), subject: str("subject"), body: str("body") });
      doc = out.data;
      error = out.error;
    } else if (op === "saveFaqs") {
      const faqs = Array.isArray(payload.faqs) ? payload.faqs : [];
      const out = saveFaqs(doc, userId, faqs as Data["faqs"]);
      doc = out.data;
      error = out.error;
    } else if (op === "saveSettings") {
      const patch = payload.patch && typeof payload.patch === "object" ? (payload.patch as Partial<Data["settings"]>) : {};
      const out = saveSettings(doc, userId, patch);
      doc = out.data;
      error = out.error;
    } else if (op === "addAnnouncement") {
      const out = addAnnouncement(doc, userId, str("title"), str("body"));
      doc = out.data;
      error = out.error;
      if (!error && "mails" in out) mail = out.mails;
    } else if (op === "setAnnouncements") {
      const items = Array.isArray(payload.announcements) ? payload.announcements : [];
      const out = setAnnouncements(doc, userId, items as Data["announcements"]);
      doc = out.data;
      error = out.error;
    } else if (op === "markNotes") {
      doc = markNotes(doc, userId);
    } else if (op === "mailUser") {
      const out = mailUser(doc, userId, str("userId"), str("subject"), str("body"));
      doc = out.data;
      error = out.error;
      mail = "mail" in out ? out.mail : undefined;
    } else if (op === "reset") {
      const me = doc.users.find((u) => u.id === userId);
      if (me?.role !== "admin") error = "Only an admin can do that.";
      else {
        doc = resetShop();
        await clearProducts();
      }
    } else {
      error = "Unknown action.";
    }

    if (!error) await saveDoc(doc, heavy);
    if (!error && mail) {
      const mailError = await sendMail(mail);
      if (mailError) error = `Saved in the app. Email failed: ${mailError}`;
    }
    return result(doc, userId, draft, error, report);
  }

export async function connectGoogle(profile: { email: string; name: string }) {
  const doc = await loadLight();
  const out = upsertGoogle(doc, profile);
  const token = crypto.randomUUID();
  await writeSession(token, out.userId, out.needsPhone ? out.draft : null);
  touchCookie(token);
  return { needsPhone: out.needsPhone, role: out.userId ? doc.users.find((u) => u.id === out.userId)?.role : "customer", token };
}

async function completePurchase(doc: Data, userId: string | null, productId: string, extra: { phone?: string; amount?: number; detail?: string }) {
  const found = productId ? await readProduct(productId) : null;
  const quoted = found ? quoteProduct(found, doc) : null;
  const provider = quoted && doc.providers.find((item) => item.id === quoted.providerId && item.enabled);
  if (!quoted?.enabled || !provider) return { error: "That service is not available.", data: doc };
  if (quoted.category === "vpn") return { error: "VPN is coming soon.", data: doc };
  const sticker = quoted.price;
  const ready = { ...doc, products: [quoted, ...doc.products.filter((item) => item.id !== quoted.id)] };
  const user = userId ? ready.users.find((item) => item.id === userId) : null;
  const face = quoted.variable ? Math.round(extra.amount || 0) : sticker;
  let charge = face;
  if (quoted.category === "smm") {
    const fields = readSmmDetail(extra.detail || "", Math.round(extra.amount || 0));
    const type = quoted.smmType || quoted.operator || "Default";
    const packaged = /^package$/i.test(type);
    const subscription = /subscription/i.test(type);
    const comments = /custom comments/i.test(type);
    const lines = String(fields.comments || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
    const quantity = packaged ? 1 : comments ? lines : Math.round(Number(fields.quantity) || 0);
    if (comments && quantity <= 0) return { error: "Add the comments, one per line.", data: doc };
    if (!packaged && !subscription && !comments) {
      if (quantity <= 0) return { error: "Enter the quantity.", data: doc };
      if (quoted.smmMin && quantity < quoted.smmMin) return { error: `Minimum quantity is ${quoted.smmMin}.`, data: doc };
      if (quoted.smmMax && quantity > quoted.smmMax) return { error: `Maximum quantity is ${quoted.smmMax}.`, data: doc };
    }
    const posts = Math.round(Number(fields.posts) || 0);
    const span = Math.round(Number(fields.max) || quoted.smmMax || 0);
    if (subscription && (span <= 0 || posts <= 0)) return { error: "Set the maximum quantity and how many posts to cover.", data: doc };
    charge = Math.round(sticker * (packaged ? 1 : subscription ? span * posts : quantity));
  }
  if (!user) return { error: "Sign in first.", data: doc };
  if (quoted.category === "airtime" && (face < 50 || face > 50000)) return { error: "Airtime must be between ₦50 and ₦50,000.", data: doc };
  if (!quoted.variable && charge <= 0) return { error: "This item has no price yet.", data: doc };
  if (user.balance < charge) return { error: "Insufficient balance. Top up your balance to make this purchase.", data: doc };
  const placed = await placeOnProvider({ product: quoted, provider, apiKey: await readProviderKey(provider.id), phone: extra.phone || "", amount: quoted.variable ? face : charge, detail: extra.detail || "" });
  if (!placed.ok) return { error: placed.error, data: doc };
  const cost = placed.cost;
  return buyProduct(ready, userId, quoted.id, {
    phone: placed.phone || extra.phone,
    amount: quoted.variable ? face : charge,
    charge,
    detail: extra.detail,
    cost,
    gain: charge - cost,
    code: quoted.category === "smm" ? "" : placed.ref,
    providerOrderId: quoted.category === "smm" ? placed.ref : "",
    providerStatus: quoted.category === "smm" ? "Pending" : "",
    refillAvailable: !!quoted.smmRefill,
    status: placed.waiting ? "waiting" : "completed",
  });
}

async function finishPaidNumber(doc: Data, userId: string, productId: string) {
  if (!productId) return { data: doc, bought: false, error: null as string | null };
  const bought = await completePurchase(doc, userId, productId, {});
  if (bought.error) return { data: doc, bought: false, error: `Payment is in your wallet. ${bought.error}` };
  return { data: bought.data, bought: true, error: null };
}

export async function purchasePreview(productId: string) {
  const session = await readSession();
  if (!session.userId) return { error: "Sign in first." as string };
  const doc = await loadLight();
  const user = doc.users.find((item) => item.id === session.userId);
  if (!user) return { error: "Sign in first." as string };
  const found = await readProduct(productId);
  if (!found || !found.enabled) return { error: "That number is no longer available." as string };
  const product = quoteProduct(found, doc);
  const short = Math.max(0, product.price - user.balance);
  const credit = short > 0 && short < 100 ? 100 : short;
  const quote = topupQuote(credit, doc.settings);
  return {
    error: null as null,
    name: product.name,
    service: product.service,
    country: product.country,
    operator: product.operator,
    price: product.price,
    balance: user.balance,
    short,
    credit,
    fee: quote.fee,
    pay: short > 0 ? quote.pay : product.price,
  };
}

export async function creditPaystack(reference: string, expectedUserId?: string | null) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { error: "Paystack is not connected yet. Add PAYSTACK_SECRET_KEY on the host." };
  let expect = expectedUserId;
  if (expectedUserId === "session") {
    const session = await readSession();
    expect = session.userId;
    if (!expect) return { error: "Sign in first." };
  }
  const res = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = (await res.json()) as { status?: boolean; data?: { status?: string; amount?: number; metadata?: { userId?: string; credit?: number; productId?: string } } };
  if (!body.status || body.data?.status !== "success") return { error: "Paystack has not confirmed this payment." };
  const userId = body.data.metadata?.userId;
  if (!userId) return { error: "Payment is missing the account it belongs to." };
  if (expect && expect !== userId) return { error: "This payment belongs to another account." };
  const charged = Math.round(Number(body.data.amount || 0) / 100);
  const credit = Math.round(Number(body.data.metadata?.credit || charged));
  const amount = credit > 0 && credit <= charged ? credit : charged;
  return locked(async () => {
    const doc = await loadLight();
    const out = creditVerified(doc, userId, amount, reference);
    if (out.error) return { error: out.error };
    const finished = await finishPaidNumber(out.data, userId, body.data?.metadata?.productId || "");
    await saveDoc(finished.data);
    await sendMail(out.mail);
    const session = await readSession();
    return { error: finished.error, bought: finished.bought, state: projectShop(finished.data, session.userId, session.draft) };
  });
}

export async function creditFromWebhook(raw: string, signature: string | null) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const digest = createHmac("sha512", secret).update(raw).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const event = JSON.parse(raw) as { event?: string; data?: { reference?: string; status?: string; amount?: number; metadata?: { userId?: string; credit?: number; productId?: string } } };
  if (event.event !== "charge.success" || event.data?.status !== "success" || !event.data.reference || !event.data.metadata?.userId) return true;
  const charged = Math.round(Number(event.data.amount || 0) / 100);
  const credit = Math.round(Number(event.data.metadata.credit || charged));
  const amount = credit > 0 && credit <= charged ? credit : charged;
  await locked(async () => {
    const doc = await loadLight();
    const out = creditVerified(doc, event.data!.metadata!.userId!, amount, event.data!.reference!);
    if (!out.error) {
      const finished = await finishPaidNumber(out.data, event.data!.metadata!.userId!, event.data!.metadata!.productId || "");
      await saveDoc(finished.data);
      await sendMail(out.mail);
    }
  });
  return true;
}

export async function startPaystack(amount: number, productId = "") {
  const n = Math.round(amount);
  if (n < 100 || n > 500000) return { error: "Amount must be between ₦100 and ₦500,000." };
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { error: "Paystack is not connected yet. Add the secret key on Render, then try again." };
  const session = await readSession();
  if (!session.userId) return { error: "Sign in first." };
  const doc = await loadLight();
  const user = doc.users.find((u) => u.id === session.userId);
  if (!user) return { error: "Sign in first." };
  const quote = topupQuote(n, doc.settings);
  if (quote.pay > 2000000) return { error: "That top up plus the site charge is too large." };
  const reference = "vl_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const origin = (process.env.APP_URL || getRequestUrl().origin).replace(/\/$/, "");
  const back = productId ? `${origin}/dashboard/wallet?product=${encodeURIComponent(productId)}` : `${origin}/dashboard/wallet`;
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      amount: quote.pay * 100,
      reference,
      currency: "NGN",
      channels: ["bank_transfer", "bank", "card", "ussd"],
      callback_url: back,
      metadata: { userId: user.id, credit: quote.credit, productId },
    }),
  });
  const body = (await res.json()) as { status?: boolean; message?: string; data?: { authorization_url?: string } };
  if (!body.status || !body.data?.authorization_url) return { error: body.message || "Paystack refused the payment." };
  return { url: body.data.authorization_url, reference };
}

export function integrationStatus() {
  return {
    paystack: !!process.env.PAYSTACK_SECRET_KEY,
    resend: !!process.env.RESEND_API_KEY,
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    ai: !!process.env.XAI_API_KEY,
    appUrl: process.env.APP_URL || "",
  };
}

export async function pullRemote(input: { url: string; apiKey?: string; providerId?: string; allow?: string[]; kind?: ImportKind }) {
  const session = await readSession();
  const doc = await loadLight();
  const me = doc.users.find((u) => u.id === session.userId);
  if (me?.role !== "admin") return { ok: false as const, error: "Only an admin can pull an API." };
  let url: URL;
  const routed = fiveSimCategoryUrl(input.url);
  try {
    url = new URL(routed.url);
  } catch {
    return { ok: false as const, error: "Enter a full https address." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false as const, error: "Only http and https catalogues can be pulled." };
  const key = input.apiKey?.trim() || (input.providerId ? await readProviderKey(input.providerId) : "");
  const headers: Record<string, string> = { Accept: "application/json" };
  const host = url.hostname.replace(/^www\./, "");
  if (key && /(^|\.)getatext\.com$/i.test(host)) headers.Auth = key;
  else if (key && /smeapi\.com\.ng$/i.test(host)) headers.Authorization = `Token ${key}`;
  else if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers["X-API-KEY"] = key;
    headers["api-key"] = key;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180000);
  const tooBig = 32_000_000;
  const readJson = async (target: URL) => {
    const res = await fetch(target, { headers, signal: ctrl.signal });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length > tooBig) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  };
  try {
    const allow = [...new Set([...(input.allow || []), routed.product].filter(Boolean))];
    if (isInstakingHost(host)) {
      if (!key) return { ok: false as const, error: "Instaking needs an API key. It is posted as the key field." };
      const balance = await instakingPost(key, { action: "balance" });
      const services = await instakingPost(key, { action: "services" });
      if (!services.ok) return { ok: false as const, error: services.error || "Instaking did not return services." };
      const items = parseInstakingServices(services.body);
      if (!items?.length) return { ok: false as const, error: "Instaking did not return a service list." };
      const reported = balance.ok && balance.body && typeof balance.body === "object" ? instakingCurrency((balance.body as { currency?: unknown }).currency) : "";
      return { ok: true as const, payload: { instaking: true, items }, currency: reported || undefined };
    }
    if (key && /(^|\.)getatext\.com$/i.test(host) && !url.searchParams.has("api_key")) url.searchParams.set("api_key", key);
    const barePrices = url.hostname.endsWith("5sim.net") && /\/v1\/guest\/prices\/?$/.test(url.pathname) && !url.searchParams.get("product") && !routed.product;
    if (barePrices) {
      if (!allow.length) return { ok: false as const, error: "Save the service names first." };
      const merged: Record<string, unknown> = {};
      for (const name of allow) {
        const slug = name.toLowerCase().replace(/[^a-z0-9.]+/g, "");
        if (!slug) continue;
        const one = new URL(`${url.origin}/v1/guest/prices?product=${encodeURIComponent(slug)}`);
        try {
          const res = await fetch(one, { headers, signal: ctrl.signal });
          if (!res.ok) continue;
          const parsed = (await res.json()) as Record<string, unknown>;
          if (parsed && typeof parsed === "object") Object.assign(merged, parsed);
        } catch {
          continue;
        }
      }
      if (!Object.keys(merged).length) return { ok: false as const, error: "None of the saved services came back from 5sim." };
      return { ok: true as const, payload: slimFiveSim(merged, "", allow, {}) };
    }
    if (input.kind === "vtu" && /\/airtime\/?$/i.test(url.pathname)) {
      const plans = new URL("/api/dataplans/?format=json", url.origin);
      const listed = await fetch(plans, { headers, signal: ctrl.signal });
      const listedText = await listed.text();
      if (!listed.ok || !listedText) return { ok: false as const, error: "That airtime address only places a purchase. The network list could not be read from the data plans." };
      try {
        return { ok: true as const, payload: JSON.parse(listedText) as unknown };
      } catch {
        return { ok: false as const, error: "The data plans did not come back as JSON, so the airtime networks could not be built." };
      }
    }
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const text = await res.text();
    if (text.length > tooBig) return { ok: false as const, error: "That catalogue is larger than 32MB." };
    const both = (input.kind === "vtu" || input.kind === "vtu-airtime" || input.kind === "vtu-data" || input.kind === "random") && !/(^|\.)getatext\.com$/i.test(host) && !/smeapi\.com\.ng$/i.test(host) && !host.endsWith("5sim.net");
    if (!res.ok && !both) {
      const detail = text.replace(/\s+/g, " ").trim().slice(0, 160);
      if (detail === "BAD_KEY") return { ok: false as const, error: "GetaText rejected the API key." };
      return { ok: false as const, error: detail ? `The API replied ${res.status}. ${detail}` : `The API replied ${res.status}.` };
    }
    let payload: unknown = null;
    if (res.ok && text) {
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        if (!both) return { ok: false as const, error: "The API did not return JSON." };
      }
    }
    if (both || (!url.hostname.endsWith("5sim.net") && key && payload && !Array.isArray(payload) && typeof payload === "object" && Object.keys(payload as object).length < 3)) {
      const actions = input.kind === "vtu" ? ["", "plans", "data", "airtime"] : input.kind === "random" ? ["", "services", "plans", "products"] : ["services"];
      const found: unknown[] = [];
      if (payload != null && extractCatalog(payload).items.length) found.push(payload);
      const keyed = new URL(url);
      if (key && !keyed.searchParams.has("api_key") && !keyed.searchParams.has("apikey")) keyed.searchParams.set("api_key", key);
      if (keyed.toString() !== url.toString()) {
        try {
          const extra = await fetch(keyed, { headers, signal: ctrl.signal });
          const extraText = await extra.text();
          if (extra.ok && extraText && extraText.length <= tooBig) {
            const parsed = JSON.parse(extraText) as unknown;
            if (extractCatalog(parsed).items.length) found.push(parsed);
          }
        } catch {
          // The plain GET is still usable.
        }
      }
      for (const action of actions) {
        const form = new URLSearchParams();
        if (key) {
          form.set("key", key);
          form.set("api_key", key);
          form.set("apiKey", key);
        }
        if (action) form.set("action", action);
        const attempts: RequestInit[] = [
          { method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: ctrl.signal },
          { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)), signal: ctrl.signal },
        ];
        for (const init of attempts) {
          try {
            const posted = await fetch(url, init);
            const postedText = await posted.text();
            if (!posted.ok || !postedText || postedText.length > tooBig) continue;
            const parsed = JSON.parse(postedText) as unknown;
            if (extractCatalog(parsed).items.length) found.push(parsed);
          } catch {
            // Try the next method.
          }
        }
      }
      if (found.length) payload = found.length === 1 ? found[0] : found;
    }
    if (payload == null) return { ok: false as const, error: both ? "The API did not return a catalogue. Tried GET and POST." : "The API did not return JSON." };
    if (!url.hostname.endsWith("5sim.net")) {
      try {
        payload = await followCatalogPages(url, payload, readJson);
      } catch {
        // A later page can fail. The pages already read stay in the payload.
      }
    }
    const hint = /hosting|rent/i.test(url.search + url.pathname) ? "hosting" : "";
    const parts = url.pathname.split("/").filter(Boolean);
    const at = parts.findIndex((part) => part === "products");
    const place = at >= 0 ? { country: parts[at + 1] || "", operator: parts[at + 2] || "any" } : {};
    const ready = url.hostname.endsWith("5sim.net") ? slimFiveSim(payload, hint, allow, place) : payload;
    if (/(^|\.)getatext\.com$/i.test(host)) {
      const flat = flattenGetaText(ready);
      if (flat) return { ok: true as const, payload: flat };
    }
    return { ok: true as const, payload: ready };
  } catch {
    return { ok: false as const, error: "Could not reach that API. Check the URL and key." };
  } finally {
    clearTimeout(timer);
  }
}

const BROWSE_RAW_CAP = 48_000;
const BROWSE_KEEP = new Set([
  "id", "service_id", "product_id", "external_id", "sku", "name", "title", "service", "service_name",
  "category", "type", "country", "price", "cost", "rate", "amount", "stock", "count", "qty", "quantity",
  "description", "desc", "details", "detail", "info", "about", "long_description", "longdescription",
  "full_description", "fulldescription", "product_description", "content", "body", "text", "note", "notes",
  "operator", "network", "min", "max",
]);

export type RemoteCard = {
  stamp: string;
  name: string;
  service: string;
  category: string;
  country: string;
  price: number;
  stock: number;
  blurb: string;
  raw: string;
};

function slimBrowseRaw(item: unknown): unknown {
  let text = "";
  try {
    text = JSON.stringify(item);
  } catch {
    return { note: "This row could not be copied." };
  }
  if (text.length <= BROWSE_RAW_CAP) return item;
  const bag = item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>) : null;
  if (!bag) return { note: text.slice(0, 4000) };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(bag)) {
    if (BROWSE_KEEP.has(key) || BROWSE_KEEP.has(key.toLowerCase())) out[key] = value;
  }
  return Object.keys(out).length ? out : { note: text.slice(0, 4000) };
}

function emptyBrowse(error: string | null) {
  return { error, items: [] as RemoteCard[], total: null as number | null, page: null as number | null, lastPage: null as number | null, nextCursor: "" };
}

export async function browseRemoteCatalog(input: { url: string; apiKey?: string; providerId?: string; cursor?: string; q?: string }) {
  const session = await readSession();
  const doc = await loadLight();
  const me = doc.users.find((u) => u.id === session.userId);
  if (me?.role !== "admin") return emptyBrowse("Only an admin can browse an API.");
  let start: URL;
  try {
    start = new URL(input.url);
  } catch {
    return emptyBrowse("Enter a full https address.");
  }
  if (start.protocol !== "https:" && start.protocol !== "http:") return emptyBrowse("Only http and https catalogues can be browsed.");
  let pageUrl = start;
  let from = 0;
  if (input.cursor) {
    try {
      pageUrl = new URL(input.cursor);
    } catch {
      return emptyBrowse("That page link is not valid.");
    }
    if (pageUrl.hostname !== start.hostname) return emptyBrowse("The next page left this catalogue.");
    from = Math.max(0, Number(pageUrl.searchParams.get("vl_from") || 0) || 0);
  }
  pageUrl.searchParams.delete("vl_from");
  const key = input.apiKey?.trim() || (input.providerId ? await readProviderKey(input.providerId) : "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key) {
    const tokenAuth = /smeapi\.com\.ng$/i.test(pageUrl.hostname);
    headers.Authorization = (tokenAuth ? "Token " : "Bearer ") + key;
    headers["X-API-KEY"] = key;
    headers["api-key"] = key;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45000);
  const tooBig = 32_000_000;
  const readJson = async (target: URL) => {
    if (target.hostname !== start.hostname) return null;
    const clean = new URL(target);
    clean.searchParams.delete("vl_from");
    try {
      const res = await fetch(clean, { headers, signal: ctrl.signal });
      if (!res.ok) return null;
      const text = await res.text();
      if (!text || text.length > tooBig) return null;
      return JSON.parse(text) as unknown;
    } catch {
      return null;
    }
  };
  try {
    const first = await readJson(pageUrl);
    if (first == null) return emptyBrowse("That page did not come back as JSON.");
    const walked = await walkBrowse({
      start: pageUrl,
      first,
      from,
      q: input.q || "",
      fetchPage: readJson,
      limit: 40,
      extraHops: 10,
    });
    const items: RemoteCard[] = walked.items.map((item) => {
      const raw = slimBrowseRaw(item);
      const parsed = extractCatalog({ items: [raw] }).items[0];
      const bag = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
      const fallback = String(bag.name || bag.title || bag.service_name || bag.service || catalogStamp(item)).slice(0, 180);
      const description = parsed?.description || "";
      let packed = "{}";
      try {
        packed = JSON.stringify(raw);
      } catch {
        packed = "{}";
      }
      return {
        stamp: catalogStamp(item),
        name: parsed?.name || fallback || "Untitled",
        service: parsed?.service || "",
        category: parsed?.category || "",
        country: parsed?.country || "",
        price: parsed?.price || 0,
        stock: parsed?.stock || 0,
        blurb: description.replace(/\s+/g, " ").trim().slice(0, 180),
        raw: packed,
      };
    });
    if (!items.length && !walked.nextCursor) {
      return {
        error: input.q ? "Nothing on the pages searched matched that text." : "This address did not return a product list. A full pull still works for catalogues that are not paged lists.",
        items,
        total: walked.total,
        page: walked.page,
        lastPage: walked.lastPage,
        nextCursor: "",
      };
    }
    return { error: null, items, total: walked.total, page: walked.page, lastPage: walked.lastPage, nextCursor: walked.nextCursor };
  } catch {
    return emptyBrowse("Could not reach that API. Check the URL and key.");
  } finally {
    clearTimeout(timer);
  }
}

type ImportMeta = { name: string; baseUrl: string; currency: "NGN" | "USD"; usdRate: number; markup: number; publish: boolean; hasKey: boolean; apiKey: string; kind: ImportKind };

type PendingImport = {
  items: ParsedItem[];
  cursor: number;
  meta: ImportMeta;
  providerId: string;
  skipped: number;
  touched: string[];
  light: Product[];
  keepOthers: boolean;
  tally: { created: number; updated: number; byCategory: Record<string, number>; byNetwork: Record<string, number> };
};

const pendingImports = new Map<string, PendingImport>();

function emptyImport(error: string | null) {
  return { error, jobId: "", total: 0, saved: 0, batch: 0, batches: 0, batchSize: IMPORT_BATCH, done: false, report: null as SyncReport | null, state: null as Data | null };
}

const KIND_EMPTY: Record<string, string> = {
  numbers: "No virtual numbers in that catalogue matched the names you saved.",
  server2: "No virtual numbers in that catalogue matched the names you saved.",
  server3: "No virtual numbers in that catalogue matched the names you saved.",
  usa: "GetaText did not return any USA services.",
  "vtu-airtime": "No airtime networks were in that catalogue.",
  "vtu-data": "No data plans were in that catalogue.",
  vtu: "Choose Airtime import or Data import.",
  vpn: "VPN is coming soon.",
  smm: "No SMM services were in that catalogue.",
  random: "That catalogue had no services.",
};

function importKindOf(value: string | undefined): ImportKind {
  return sourceKindOf(value) || "numbers";
}

export async function beginCatalogImport(input: { url?: string; payload?: unknown; apiKey?: string; providerId?: string; name?: string; baseUrl?: string; currency?: string; usdRate?: number; markup?: number; publish?: boolean; kind?: string; selective?: boolean }) {
  const session = await readSession();
  const doc = await loadLight();
  const me = doc.users.find((u) => u.id === session.userId);
  if (me?.role !== "admin") return emptyImport("Only an admin can pull an API.");
  const selective = !!input.selective;
  const kind = importKindOf(input.kind);
  if (kind === "vpn") return emptyImport("VPN is coming soon. No products were imported.");
  if (kind === "vtu") return emptyImport("Choose Airtime import or Data import. Electricity and TV are not imported.");
  const wanted = doc.settings.wantedServices?.length ? doc.settings.wantedServices : [...MAJOR_SERVICES];
  const routed = input.url ? fiveSimCategoryUrl(input.url) : { url: "", product: "" };
  const wantedForPull = routed.product ? [...wanted, routed.product] : wanted;
  let payload = input.payload;
  let reportedCurrency: "NGN" | "USD" | "" = "";
  if (!selective && input.url) {
    const fetched = await pullRemote({ url: input.url, apiKey: input.apiKey, providerId: input.providerId, allow: kind === "numbers" ? wantedForPull : [], kind });
    if (!fetched.ok) return emptyImport(fetched.error);
    payload = fetched.payload;
    if ("currency" in fetched && (fetched.currency === "NGN" || fetched.currency === "USD")) reportedCurrency = fetched.currency;
  }
  if (payload == null) return emptyImport(selective ? "Tick products before importing." : "Add a catalogue URL or paste JSON.");
  if (selective) {
    let size = 0;
    try {
      size = JSON.stringify(payload).length;
    } catch {
      return emptyImport("Those products could not be read.");
    }
    if (size > 8_000_000) return emptyImport("That selection is too large. Import fewer products.");
  }
  const instakingBundle = payload && typeof payload === "object" && !Array.isArray(payload) && (payload as { instaking?: boolean }).instaking === true
    ? (payload as { instaking: true; items: ParsedItem[] })
    : null;
  const extracted = instakingBundle ? { items: instakingBundle.items, skipped: 0 } : extractCatalog(payload);
  const numberLike = kind === "numbers" || kind === "server2" || kind === "server3" || kind === "usa";
  const shaped = kind === "vtu-airtime"
    ? airtimeProductsFromPayload(payload).map((item) => ({ ...item, category: "airtime" as const, importType: "VTU_IMPORT", serverId: "" }))
    : shapeImport(extracted.items, instakingBundle ? "smm" : kind, !selective && numberLike ? wantedForPull : []);
  const items = selective ? shaped.slice(0, 200) : shaped;
  if (!items.length) return emptyImport(selective ? "None of the ticked products could be read." : KIND_EMPTY[kind]);
  const jobId = crypto.randomUUID();
  const meta: ImportMeta = {
    name: input.name || "New API",
    baseUrl: input.baseUrl || input.url || "https://provider.example/api",
    currency: reportedCurrency || (input.currency === "USD" ? "USD" : "NGN"),
    usdRate: Number(input.usdRate) || 0,
    markup: Number(input.markup) || 0,
    publish: !!input.publish,
    hasKey: !!input.apiKey || !!input.url,
    apiKey: input.apiKey || "",
    kind,
  };
  const touched = [...new Set(items.map((item) => `${item.country}|${item.service}`))];
  pendingImports.clear();
  pendingImports.set(jobId, {
    items,
    cursor: 0,
    meta,
    providerId: input.providerId || "",
    skipped: extracted.skipped + (extracted.items.length - items.length),
    touched,
    light: [],
    keepOthers: selective,
    tally: { created: 0, updated: 0, byCategory: {}, byNetwork: {} },
  });
  return { error: null, jobId, total: items.length, saved: 0, batch: 0, batches: importBatchCount(items.length), batchSize: IMPORT_BATCH, done: false, report: null, state: null };
}

function withProvider(doc: Data, meta: ImportMeta, providerId: string) {
  const now = new Date().toISOString();
  const providers = doc.providers.map((provider) => ({ ...provider }));
  let provider = providerId ? providers.find((item) => item.id === providerId) : undefined;
  const five = /5sim\.net/i.test(meta.baseUrl);
  const dest = destinationOf(meta.kind);
  if (!provider) {
    provider = {
      id: uid("prov"),
      name: meta.name,
      baseUrl: meta.baseUrl,
      hasKey: meta.hasKey,
      servesNumbers: dest?.importType === "NUMBER_IMPORT",
      enabled: true,
      currency: meta.currency,
      usdRate: meta.usdRate > 0 ? meta.usdRate : five ? 2646 : doc.settings.usdNgn,
      markup: 1,
      markupPercent: meta.markup > 0 ? meta.markup : 0,
      importType: dest?.importType || "",
      serverId: dest?.serverId || "",
      operatorMarkups: {},
      operatorPrices: {},
      createdAt: now,
      lastSync: null,
    };
    providers.push(provider);
  } else {
    provider.name = meta.name || provider.name;
    provider.baseUrl = meta.baseUrl || provider.baseUrl;
    provider.currency = meta.currency;
    if (meta.usdRate > 0) provider.usdRate = meta.usdRate;
    if (meta.markup > 0) provider.markupPercent = meta.markup;
    if (!provider.usdRate) provider.usdRate = five ? 2646 : doc.settings.usdNgn;
    if (dest) {
      provider.importType = dest.importType;
      provider.serverId = dest.serverId;
      provider.servesNumbers = dest.importType === "NUMBER_IMPORT";
    }
    provider.enabled = true;
    if (meta.hasKey) provider.hasKey = true;
  }
  return { doc: { ...doc, providers }, provider };
}

function mergeLight(doc: Data, providerId: string, rows: Product[]): Data {
  if (!rows.length) return doc;
  const cats = new Set(rows.map((row) => row.category));
  const incoming = new Set(rows.map((row) => row.externalId));
  const kept = doc.products.filter((product) => product.providerId !== providerId || !cats.has(product.category) || incoming.has(product.externalId));
  const byExternal = new Map(kept.filter((product) => product.providerId === providerId).map((product) => [product.externalId, product]));
  const products = [...kept];
  for (const row of rows) {
    const prev = byExternal.get(row.externalId);
    if (!prev) {
      products.push(row);
      continue;
    }
    const at = products.indexOf(prev);
    if (at >= 0) products[at] = { ...row, id: prev.id, enabled: prev.enabled || row.enabled };
  }
  return { ...doc, products };
}

function mergeLightAdd(doc: Data, providerId: string, rows: Product[]): Data {
  if (!rows.length) return doc;
  const products = [...doc.products];
  const byExternal = new Map(products.filter((product) => product.providerId === providerId).map((product) => [product.externalId, product]));
  for (const row of rows) {
    const prev = byExternal.get(row.externalId);
    if (!prev) {
      products.push(row);
      byExternal.set(row.externalId, row);
      continue;
    }
    const at = products.indexOf(prev);
    if (at >= 0) {
      const next = { ...row, id: prev.id, enabled: prev.enabled || row.enabled };
      products[at] = next;
      byExternal.set(row.externalId, next);
    }
  }
  return { ...doc, products };
}

async function stepFromMemory(jobId: string) {
  const job = pendingImports.get(jobId);
  if (!job) return emptyImport("That import is no longer running. Start it again.");
  const session = await readSession();
  const light = await loadLight();
  const me = light.users.find((user) => user.id === session.userId);
  if (me?.role !== "admin") return emptyImport("Only an admin can pull an API.");
  const total = job.items.length;
  const batches = importBatchCount(total);
  if (job.cursor >= total) {
    pendingImports.delete(jobId);
    return { error: null, jobId, total, saved: total, batch: batches, batches, batchSize: IMPORT_BATCH, done: true, report: null, state: projectShop(light, session.userId, session.draft) };
  }
  const slice = job.items.slice(job.cursor, job.cursor + IMPORT_BATCH);
  const finalize = job.cursor + slice.length >= total;
  try {
    return await locked(async () => {
      const loaded = await loadLight();
      const held = withProvider(loaded, job.meta, job.providerId);
      job.providerId = held.provider.id;
      const existing = await countExistingProducts(held.provider.id, slice.map((item) => item.externalId));
      const products: Product[] = slice.map((item) => ({
        id: uid("prd"),
        providerId: held.provider.id,
        externalId: item.externalId,
        category: item.category,
        name: item.name,
        service: item.service,
        country: item.country,
        network: item.network,
        price: customerPrice({
          cost: item.price,
          currency: held.provider.currency,
          usdRate: held.provider.usdRate || loaded.settings.usdNgn,
          successRate: successRateOf(item.rate < 0 ? null : item.rate),
          pricing: pricingOf(loaded.settings.pricing),
          providerId: held.provider.id,
          service: item.service,
          providerPercent: held.provider.markupPercent && held.provider.markupPercent > 0 ? held.provider.markupPercent : null,
          defaultPercent: loaded.settings.margin,
        }).price,
        cost: item.price,
        stock: item.stock,
        operator: item.operator || "",
        rate: item.rate || 0,
        rates: item.rates || "",
        enabled: job.meta.publish,
        validity: item.validity,
        variable: item.variable,
        description: item.description,
        importType: item.importType || "",
        serverId: item.serverId || "",
        subcategory: item.subcategory || "",
        smmMin: item.smmMin || 0,
        smmMax: item.smmMax || 0,
        smmType: item.smmType || "",
        smmRefill: !!item.smmRefill,
      }));
      await upsertProductRows(products, jobId);
      job.light.push(...products.filter((product) => product.category === "airtime" || product.category === "data" || product.category === "logs" || product.category === "smm"));
      job.tally.created += Math.max(0, slice.length - existing);
      job.tally.updated += existing;
      for (const item of slice) {
        job.tally.byCategory[item.category] = (job.tally.byCategory[item.category] || 0) + 1;
        if (item.network) job.tally.byNetwork[item.network] = (job.tally.byNetwork[item.network] || 0) + 1;
      }
      job.cursor += slice.length;
      if (job.meta.apiKey) {
        await rememberKey(held.provider.id, job.meta.apiKey);
        job.meta.apiKey = "";
      }
      if (finalize) {
        if (job.keepOthers) {
          held.doc = mergeLightAdd(held.doc, held.provider.id, job.light);
        } else {
          const categories = [...new Set(job.items.map((item) => item.category))];
          await pruneSyncedProducts(held.provider.id, jobId, job.touched, categories);
          held.doc = mergeLight(held.doc, held.provider.id, job.light);
        }
      }
      if (job.items.some((item) => item.category === "number")) held.provider.servesNumbers = true;
      held.provider.enabled = true;
      held.provider.lastSync = {
        at: new Date().toISOString(),
        imported: finalize ? total : job.cursor,
        created: job.tally.created,
        updated: job.tally.updated,
        skipped: job.skipped,
        byCategory: job.tally.byCategory,
        byNetwork: job.tally.byNetwork,
      };
      await writeState(held.doc);
      const saved = job.cursor;
      const batch = Math.ceil(saved / IMPORT_BATCH);
      const report: SyncReport = {
        imported: finalize ? total : slice.length,
        created: job.tally.created,
        updated: job.tally.updated,
        skipped: job.skipped,
        byCategory: job.tally.byCategory,
        byNetwork: job.tally.byNetwork,
        providerId: held.provider.id,
        serverLabel: serverLabel(held.doc.providers, held.provider.id),
      };
      if (finalize) pendingImports.delete(jobId);
      const fresh = await readSession();
      return {
        error: null,
        jobId,
        total,
        saved,
        batch,
        batches,
        batchSize: IMPORT_BATCH,
        done: finalize,
        report,
        state: projectShop(held.doc, fresh.userId, fresh.draft),
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "This batch could not be saved.";
    return { error: message, jobId, total, saved: job.cursor, batch: Math.floor(job.cursor / IMPORT_BATCH), batches, batchSize: IMPORT_BATCH, done: false, report: null, state: null };
  }
}

export async function stepCatalogImport(jobId: string) {
  if (pendingImports.has(jobId)) return stepFromMemory(jobId);
  if (!jobId) return emptyImport("Missing import.");
  const session = await readSession();
  const light = await loadLight();
  const me = light.users.find((u) => u.id === session.userId);
  if (me?.role !== "admin") return emptyImport("Only an admin can pull an API.");
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    total: number;
    cursor: number;
    batch_size: number;
    created_count: number;
    updated_count: number;
    skipped: number;
    by_category: string;
    by_network: string;
    provider_id: string;
    keep_ids: string;
    touched: string;
    meta: string;
  }>`select id, total, cursor, batch_size, created_count, updated_count, skipped, by_category, by_network, provider_id, keep_ids, touched, meta from shop_import_jobs where id = ${jobId}`;
  const job = rows[0];
  if (!job) return emptyImport("That import is no longer on the server. Start it again.");
  const total = Number(job.total) || 0;
  const cursor = Number(job.cursor) || 0;
  const batchSize = Number(job.batch_size) || IMPORT_BATCH;
  const batches = importBatchCount(total, batchSize);
  if (cursor >= batches) {
    return { error: null, jobId, total, saved: total, batch: batches, batches, batchSize, done: true, report: null, state: projectShop(light, session.userId, session.draft) };
  }
  const batchRows = await sql<{ items: string }>`select items from shop_import_batches where job_id = ${jobId} and seq = ${cursor}`;
  if (!batchRows[0]) return emptyImport("A saved batch is missing. Start the import again.");
  let items: ParsedItem[] = [];
  try {
    items = JSON.parse(batchRows[0].items) as ParsedItem[];
  } catch {
    return emptyImport("A saved batch could not be read. Start the import again.");
  }
  const meta = JSON.parse(job.meta) as ImportMeta;
  const tally = {
    created: Number(job.created_count) || 0,
    updated: Number(job.updated_count) || 0,
    byCategory: JSON.parse(job.by_category || "{}") as Record<string, number>,
    byNetwork: JSON.parse(job.by_network || "{}") as Record<string, number>,
  };
  const finalize = cursor + 1 >= batches;
  try {
    return await locked(async () => {
      const doc = await loadDoc(true);
      const applied = applyImportSlice(doc, {
        providerId: job.provider_id || undefined,
        name: meta.name,
        baseUrl: meta.baseUrl,
        hasKey: meta.hasKey,
        currency: meta.currency,
        usdRate: meta.usdRate,
        markup: meta.markup,
        items,
        skipped: Number(job.skipped) || 0,
        enable: () => meta.publish,
        finalize,
        keepIds: finalize ? (JSON.parse(job.keep_ids || "[]") as string[]) : [],
        touchedKeys: finalize ? (JSON.parse(job.touched || "[]") as string[]) : [],
        tally,
      });
      await saveDoc(applied.data, true);
      if (meta.apiKey) {
        await rememberKey(applied.providerId, meta.apiKey);
        meta.apiKey = "";
      }
      const saved = finalize ? total : Math.min(total, (cursor + 1) * batchSize);
      await sql`update shop_import_jobs set status = ${finalize ? "done" : "running"}, cursor = ${cursor + 1}, created_count = ${applied.tally.created}, updated_count = ${applied.tally.updated}, by_category = ${JSON.stringify(applied.tally.byCategory)}, by_network = ${JSON.stringify(applied.tally.byNetwork)}, provider_id = ${applied.providerId}, meta = ${JSON.stringify(meta)}, error = '' where id = ${jobId}`;
      await sql`delete from shop_import_batches where job_id = ${jobId} and seq = ${cursor}`;
      if (finalize) await sql`update shop_import_jobs set keep_ids = '[]', touched = '[]' where id = ${jobId}`;
      const fresh = await readSession();
      return {
        error: null,
        jobId,
        total,
        saved,
        batch: cursor + 1,
        batches,
        batchSize,
        done: finalize,
        report: applied.report,
        state: projectShop(applied.data, fresh.userId, fresh.draft),
      };
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "This batch could not be saved.";
    await sql`update shop_import_jobs set status = 'failed', error = ${message.slice(0, 300)} where id = ${jobId}`;
    return { error: message, jobId, total, saved: Math.min(total, cursor * batchSize), batch: cursor, batches, batchSize, done: false, report: null, state: null };
  }
}

export async function importFromUrl(input: { url: string; apiKey?: string; providerId?: string; name?: string; baseUrl?: string; currency?: string; usdRate?: number; markup?: number; publish?: boolean }) {
  const fetched = await pullRemote({ url: input.url, apiKey: input.apiKey, providerId: input.providerId });
  if (!fetched.ok) {
    return locked(async () => {
      const doc = await loadLight();
      const session = await readSession();
      return result(doc, session.userId, session.draft, fetched.error, null);
    });
  }
  return applyAct("import", {
    providerId: input.providerId || "",
    name: input.name || "",
    baseUrl: input.baseUrl || input.url,
    currency: input.currency === "USD" ? "USD" : "NGN",
    usdRate: Number(input.usdRate) || 0,
    markup: Number(input.markup) || 0,
    payload: fetched.payload,
    hasKey: true,
    publish: !!input.publish,
    apiKey: input.apiKey || "",
  });
}

export async function browseNumbers(input: { providerId?: string; category?: string; country?: string; service?: string; q?: string; detail?: boolean; list?: string; serverId?: string }) {
  const doc = await loadLight();
  const session = await readSession();
  const me = doc.users.find((u) => u.id === session.userId);
  const admin = me?.role === "admin";
  const want = input.category === "usa" ? "usa" : input.category === "rent" ? "rent" : "number";
  const provider = doc.providers.find((item) => item.id === input.providerId);
  const serverId = want === "number" ? input.serverId || provider?.serverId || "" : "";
  const enabledProviderIds = doc.providers.filter((item) => item.enabled && (want !== "usa" || item.importType === "USA_IMPORT" || item.serverId === "usa")).map((item) => item.id);
  const hidden = admin ? await queryHidden(input.providerId || "", want) : 0;
  const empty = { services: [] as { service: string; price: number }[], countries: [] as Product[], operators: [] as Product[], hidden };
  const query = {
    providerId: want === "usa" ? "" : input.providerId || "",
    category: want,
    serverId,
    country: input.country || "",
    service: input.service || "",
    q: (input.q || "").trim(),
    admin,
    enabledProviderIds: want === "usa" ? enabledProviderIds : doc.providers.filter((item) => item.enabled).map((item) => item.id),
  };
  if (!admin && input.providerId && !enabledProviderIds.includes(input.providerId)) return empty;
  const serviceList = async () => {
    const rows = await queryServices(query);
    const best = new Map<string, number>();
    for (const row of rows) {
      const price = quoteProduct(
        { id: "", providerId: row.providerId, externalId: "", category: want, name: row.service, service: row.service, country: input.country || "", network: "", price: row.price, cost: row.cost, stock: 0, operator: "", rate: -1, rates: "", enabled: true, validity: "", variable: false, description: "" },
        doc,
      ).price;
      const prev = best.get(row.service);
      if (price > 0 && (prev == null || price < prev)) best.set(row.service, price);
    }
    return [...best.entries()].map(([service, price]) => ({ service, price })).sort((a, b) => a.service.localeCompare(b.service)).slice(0, 100);
  };
  if (input.list === "countries") {
    const countries = (await queryCountries({ ...query, service: "", q: "" })).map((row) => quoteProduct(row, doc)).sort((a, b) => a.price - b.price || a.country.localeCompare(b.country));
    return { ...empty, countries };
  }
  if (input.detail && input.service && input.country) {
    const rows = (await queryOperators(query)).map((row) => quoteProduct(row, doc));
    const operators = rows.sort((a, b) => b.rate - a.rate || a.price - b.price);
    return { ...empty, operators };
  }
  if (input.list === "services" || !input.service) return { ...empty, services: await serviceList() };
  const countries = (await queryCountries(query)).map((row) => quoteProduct(row, doc));
  return { ...empty, countries };
}

export async function browseExtras(input: { q?: string; kind?: string; page?: number; subcategory?: string }) {
  const doc = await loadLight();
  const session = await readSession();
  if (!session.userId) return { rows: [] as Product[], more: false };
  const providerIds = doc.providers.filter((provider) => provider.enabled).map((provider) => provider.id);
  const kind = input.kind === "vpn" || input.kind === "smm" ? input.kind : "random";
  const page = await queryExtras({ q: (input.q || "").trim(), providerIds, kind, page: input.page, subcategory: (input.subcategory || "").trim() });
  return { rows: page.rows.map((row) => quoteProduct(row, doc)), more: page.more };
}

export async function browseCatalog(input: { q?: string; category?: string; providerId?: string; only?: string; page?: number; subcategory?: string }) {
  const doc = await loadLight();
  const session = await readSession();
  const me = doc.users.find((u) => u.id === session.userId);
  if (me?.role !== "admin") return { rows: [] as Product[], total: 0, live: 0 };
  return queryCatalogPage({
    q: (input.q || "").trim(),
    category: input.category || "",
    providerId: input.providerId || "",
    only: input.only || "",
    page: Number(input.page) || 0,
    subcategory: input.subcategory || "",
  });
}

function providerHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

async function syncInstakingOrders(doc: Data): Promise<Data> {
  const waiting = doc.orders.filter((order) => order.category === "smm" && order.status === "waiting" && order.providerOrderId);
  const refills = doc.orders.filter((order) => order.category === "smm" && order.refillId && order.providerStatus === "Refill requested");
  if (!waiting.length && !refills.length) return doc;
  const groups = new Map<string, typeof waiting>();
  for (const order of waiting) {
    const product = doc.products.find((item) => item.id === order.productId) || await readProduct(order.productId);
    if (!product) continue;
    const list = groups.get(product.providerId) || [];
    list.push(order);
    groups.set(product.providerId, list);
  }
  let orders = doc.orders;
  for (const [providerId, rows] of groups) {
    const provider = doc.providers.find((item) => item.id === providerId);
    if (!provider || !isInstakingHost(providerHost(provider.baseUrl))) continue;
    const key = await readProviderKey(providerId);
    if (!key) continue;
    const ids = rows.map((order) => order.providerOrderId || "").filter(Boolean).slice(0, 100);
    const sent = await instakingPost(key, { action: "status", orders: ids.join(",") });
    if (!sent.ok || !sent.body || typeof sent.body !== "object" || Array.isArray(sent.body)) continue;
    const table = sent.body as Record<string, unknown>;
    orders = orders.map((order) => {
      const id = order.providerOrderId || "";
      if (!ids.includes(id)) return order;
      const row = table[id];
      if (!row || typeof row !== "object" || Array.isArray(row)) return order;
      const record = row as { status?: unknown; error?: unknown };
      const status = String(record.status || record.error || "");
      if (!status) return order;
      return { ...order, providerStatus: status, status: /completed/i.test(status) ? "completed" as const : order.status };
    });
  }
  for (const order of refills) {
    const product = doc.products.find((item) => item.id === order.productId) || await readProduct(order.productId);
    const provider = product && doc.providers.find((item) => item.id === product.providerId);
    if (!provider || !isInstakingHost(providerHost(provider.baseUrl))) continue;
    const key = await readProviderKey(provider.id);
    if (!key) continue;
    const sent = await instakingPost(key, { action: "refill_status", refill: order.refillId || "" });
    const status = sent.ok && sent.body && typeof sent.body === "object" ? String((sent.body as { status?: unknown }).status || "") : "";
    if (!status) continue;
    orders = orders.map((item) => item.id === order.id ? { ...item, providerStatus: `Refill ${status}` } : item);
  }
  return orders === doc.orders ? doc : { ...doc, orders };
}

async function refillInstakingOrder(doc: Data, userId: string | null, orderId: string) {
  const user = doc.users.find((item) => item.id === userId);
  const order = doc.orders.find((item) => item.id === orderId && (user?.role === "admin" || item.userId === user?.id));
  if (!user || !order) return { error: "Order not found.", data: doc };
  if (!order.refillAvailable || !order.providerOrderId) return { error: "This order cannot be refilled.", data: doc };
  const product = doc.products.find((item) => item.id === order.productId) || await readProduct(order.productId);
  const provider = product && doc.providers.find((item) => item.id === product.providerId);
  if (!provider || !isInstakingHost(providerHost(provider.baseUrl))) return { error: "This order is not an Instaking order.", data: doc };
  const key = await readProviderKey(provider.id);
  if (!key) return { error: "Instaking has no key saved.", data: doc };
  const sent = await instakingPost(key, { action: "refill", order: order.providerOrderId });
  if (!sent.ok) return { error: sent.error || "Instaking refused the refill.", data: doc };
  const refill = sent.body && typeof sent.body === "object" ? String((sent.body as { refill?: unknown }).refill || "") : "";
  return {
    error: null,
    data: { ...doc, orders: doc.orders.map((item) => item.id === order.id ? { ...item, refillId: refill, providerStatus: "Refill requested" } : item) },
  };
}

export async function testInstakingKey(apiKey: string) {
  const session = await readSession();
  const doc = await loadLight();
  const me = doc.users.find((user) => user.id === session.userId);
  if (me?.role !== "admin") return { ok: false, error: "Only an admin can test a key.", balance: "", currency: "" };
  const key = apiKey.trim();
  if (!key) return { ok: false, error: "Add the Instaking API key first.", balance: "", currency: "" };
  const sent = await instakingPost(key, { action: "balance" });
  if (!sent.ok || !sent.body || typeof sent.body !== "object") return { ok: false, error: sent.error || "Instaking rejected that key.", balance: "", currency: "" };
  const body = sent.body as { balance?: unknown; currency?: unknown };
  return { ok: true, error: "", balance: String(body.balance ?? ""), currency: instakingCurrency(body.currency) || String(body.currency || "") };
}

export async function askSupport(question: string) {
  const q = question.trim().slice(0, 500);
  if (!q) return { text: "Type a question first." };
  const doc = await loadLight();
  const faq = doc.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join("\n");
  const local = localAnswer(q, doc);
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { text: local };
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 180,
        messages: [
          {
            role: "system",
            content: `You are Vera, the VeriLogs support guide. Answer in 2-4 short sentences. Naira wallet, virtual numbers on separate servers, data split by MTN Airtel Glo 9mobile Smile, Paystack top-ups, Telegram ${doc.settings.telegram}. Do not invent balances. If you cannot help, point them to Telegram. FAQs:\n${faq}`,
          },
          { role: "user", content: q },
        ],
      }),
    });
    if (!res.ok) return { text: local };
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { text: body.choices?.[0]?.message?.content?.trim() || local };
  } catch {
    return { text: local };
  }
}

function localAnswer(q: string, doc: Data) {
  const s = q.toLowerCase();
  const hit = doc.faqs.find((f) => s.split(/\s+/).some((w) => w.length > 3 && (f.question + f.answer).toLowerCase().includes(w)));
  if (hit) return hit.answer;
  if (/refund|cancel|sms|code/.test(s)) return "If a number is still waiting, open Virtual numbers and cancel it. The naira returns to your wallet. Codes show on that same card.";
  if (/wallet|pay|fund|paystack/.test(s)) return "Open Fund wallet, pick an amount, and pay with Paystack. The balance updates after Paystack confirms it.";
  if (/server|whatsapp|number/.test(s)) return "Each SMS API is its own server. Pick Server 1 or Server 2, then the service and country. They are not merged.";
  if (/mtn|airtel|glo|data|9mobile|smile/.test(s)) return "Open Data and pick the SIM first. MTN, Airtel, Glo, 9mobile and Smile are separate lists.";
  if (/telegram|human|complaint|agent/.test(s)) return `A person can help on Telegram: ${doc.settings.telegram}`;
  return `${doc.settings.supportWelcome} You can also open ${doc.settings.telegram}.`;
}

export function publicOrigin(request: Request) {
  const url = new URL(request.url);
  const forwarded = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  const host = forwarded.split(",")[0].trim();
  const proto = (request.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();
  if (host && !/localhost|127\.0\.0\.1/i.test(host)) return `${proto}://${host}`.replace(/\/$/, "");
  return (process.env.APP_URL || url.origin).replace(/\/$/, "");
}

export function googlePublicOrigin() {
  return "https://veri-logs.com";
}

export function googleRedirect(origin: string) {
  return origin.replace(/\/$/, "") + "/api/google/callback";
}

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleStartUrl(redirect: string) {
  const id = (process.env.GOOGLE_CLIENT_ID || "").trim();
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", id);
  auth.searchParams.set("redirect_uri", redirect);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("prompt", "select_account");
  auth.searchParams.set("include_granted_scopes", "true");
  return auth.toString();
}

function googleProfile(idToken: string) {
  try {
    const part = idToken.split(".")[1] || "";
    const json = Buffer.from(part, "base64url").toString("utf8");
    const payload = JSON.parse(json) as { email?: string; name?: string };
    return { email: payload.email || "", name: payload.name || "" };
  } catch {
    return { email: "", name: "" };
  }
}

export async function googleExchange(code: string, redirect: string) {
  const body = new URLSearchParams({
    code,
    client_id: (process.env.GOOGLE_CLIENT_ID || "").trim(),
    client_secret: (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
    redirect_uri: redirect,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = (await tokenRes.json()) as { access_token?: string; id_token?: string; error?: string; error_description?: string };
  if (!token.access_token && !token.id_token) {
    return { error: token.error_description || token.error || "Google rejected the sign-in.", needsPhone: false, role: "customer" as const, token: "" };
  }
  let email = "";
  let name = "";
  if (token.id_token) {
    const fromId = googleProfile(token.id_token);
    email = fromId.email;
    name = fromId.name;
  }
  if (!email && token.access_token) {
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const profile = (await profileRes.json()) as { email?: string; name?: string };
    email = profile.email || "";
    name = name || profile.name || "";
  }
  if (!email) return { error: "Google did not share an email for this account.", needsPhone: false, role: "customer" as const, token: "" };
  const linked = await connectGoogle({ email, name: name || email });
  return { error: null as string | null, ...linked };
}
