import { deleteCookie, getCookie, getRequestUrl, setCookie } from "@tanstack/react-start/server";
import { paystackSignatureOk } from "@/lib/paystack-sign";
import { getSql } from "@/lib/db";
import { freshData, normalizeData, quoteProduct, resolveNumberServer, serverLabel, topupQuote, withAdminLogin, type Data, type Product, type SyncReport } from "@/lib/catalog";
import { customerPrice, profitsOf, sellQuote, summarizeProfit } from "@/lib/pricing";
import { rentCharge } from "@/lib/rent";
import { extractCatalog, slimFiveSim, fiveSimCategoryUrl, fiveSimImportPlan, shapeImport, attachVtuIds, vtuCatalogueUrl, discoverServiceNames, mergeServiceNames, type ImportKind, type ParsedItem } from "@/lib/categorize";
import { applyCategoryLogo } from "@/lib/logo-discover";
import { AIRTIME_CLOSED, BILL_CLOSED, SMM_CLOSED, airtimeSalesOpen, isRetiredBill, smmSalesOpen } from "@/lib/purchase-history";
import { airtimeCharge, airtimeImportBlock, airtimeOffers, prepareAirtimePurchase, sendAirtimePurchase, withoutAirtimeProducts, type AirtimeRouteRecord } from "@/lib/airtime";
import { deleteAirtimeNetworkRow, deleteAirtimeRouteRow, listAirtimeRecords, saveAirtimeNetworkRow, saveAirtimeRouteRow } from "@/lib/airtime-rows.server";
import { destinationOf, flattenGetaText, readGetaTextPrices, sourceKindOf } from "@/lib/import-source";
import { instakingCurrency, instakingPost, isInstakingHost, parseInstakingServices, readSmmDetail } from "@/lib/instaking";
import { catalogStamp, followCatalogPages, walkBrowse } from "@/lib/catalog-pages";
import { applyFieldMap, getatextCatalogueUrl, looksLikePurchase, publicEndpoint, setupView, type CatalogMethod, type CatalogSetup } from "@/lib/catalog-request";
import { fetchNote, probeProviderCatalogue, readCataloguePage, reportOf, saveProviderFetch, loadProviderFetch, type FetchReport } from "@/lib/catalog-fetch.server";
import { IMPORT_BATCH, importBatchCount, sliceImport } from "@/lib/import-batch";
import { uid } from "@/lib/money";
import { isFiveSimServer1, isWhatsAppService, preferWhatsApp, wantsWhatsAppLookup, finishServicePage } from "@/lib/whatsapp-availability";
import { mentionedCountry, mentionedService } from "@/lib/vera-mind";
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
  queryStockedService,
  queryWhatsAppOffer,
  queryShelf,
  catalogCounts,
  sampleProducts,
  decrementStock,
  readProduct,
  setProductSubcategory,
  setRowsEnabled,
  lockListing,
  upsertProductRows,
} from "@/lib/product-rows.server";
import { catalogSplitVerified, ensureCatalogSplit } from "@/lib/catalog-split.server";
import { beginPurchaseKey, creditBalance, debitBalance, markPurchaseKey, overlayBalances, reconcilePurchases } from "@/lib/shop-wallet.server";
import { recordReferral, reverseReferral, settleDepositCashback, settleReferral } from "@/lib/referral.server";
import { REFERRAL_CASHBACK_NOTE } from "@/lib/referral";
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
  recordAirtimeOrder,
  recordRentOrder,
  resetPassword,
  resetShop,
  saveFaqs,
  saveSettings,
  setAnnouncements,
  setEnabled,
  editListing,
  setProvider,
  stampReferralCodes,
  tickWaiting,
  updateProfile,
  upsertGoogle,
  type Draft,
} from "@/lib/shop-logic";

const COOKIE = "vl_session";

type Mail = { to: string; subject: string; text: string };
type ApplyResult = { error: string | null; state: Data; report: SyncReport | null; orderId?: string };

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

async function rotateSession(previous: string | null, userId: string, remember = true) {
  const token = crypto.randomUUID();
  const sql = await getSql();
  if (previous) await sql`delete from shop_sessions where token = ${previous}`;
  await writeSession(token, userId, null);
  touchCookie(token, remember);
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

async function loadDoc(_withCatalog = false): Promise<Data> {
  return loadLight();
}

export async function loadLight(): Promise<Data> {
  const sql = await getSql();
  const rows = await sql<{ doc: string }>`select doc from shop_state where id = 'main'`;
  if (!rows[0]) {
    const doc = freshData();
    const light = { ...doc, products: [] as Data["products"] };
    await sql`insert into shop_state (id, doc) values ('main', ${JSON.stringify(light)})`;
    const seeded = stampReferralCodes(await overlayBalances(light));
    if (seeded.changed) await writeState(seeded.data);
    return seeded.data;
  }
  const parsed = normalizeData(JSON.parse(rows[0].doc) as Data);
  const doc = withAdminLogin(withoutSampleCatalog(parsed));
  let clear = false;
  try {
    const split = await ensureCatalogSplit(doc);
    clear = split.clear;
    if (!split.ok && split.error) console.error(split.error);
  } catch (err) {
    console.error("catalogue split skipped", err instanceof Error ? err.message : err);
  }
  const light = { ...doc, products: [] as Data["products"] };
  if (clear) await writeState(light);
  const balanced = await overlayBalances(light);
  const stamped = stampReferralCodes(balanced);
  if (stamped.changed) await writeState(stamped.data);
  return stamped.data;
}

async function clearNumberImports() {
  const sql = await getSql();
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const text = readFileSync(join(process.cwd(), "scripts/number-catalogue-reset.sql"), "utf8");
  await sql.query(text);
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

async function writeState(doc: Data) {
  const sql = await getSql();
  doc = await overlayBalances(doc);
  let products: Data["products"] = [];
  if (!catalogSplitVerified()) {
    const rows = await sql<{ doc: string }>`select doc from shop_state where id = 'main'`;
    if (rows[0]?.doc) {
      try {
        const prev = JSON.parse(rows[0].doc) as { products?: Data["products"] };
        if (Array.isArray(prev.products)) products = prev.products;
      } catch {
        products = [];
      }
    }
  }
  const text = JSON.stringify({ ...doc, products });
  const existing = await sql`select id from shop_state where id = 'main'`;
  if (existing[0]) await sql`update shop_state set doc = ${text}, updated_at = now() where id = 'main'`;
  else await sql`insert into shop_state (id, doc) values ('main', ${text})`;
}

async function saveDoc(doc: Data, _catalog = false) {
  await writeState({ ...doc, products: [] });
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
  }
  try {
    const reconciled = await reconcilePurchases(doc);
    if (reconciled.changed) {
      doc = reconciled.doc;
      await writeState(doc);
    }
  } catch (err) {
    console.error("purchase reconcile skipped", err instanceof Error ? err.message : err);
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
    let orderId = "";

    const str = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : "");
    const num = (k: string) => (typeof payload[k] === "number" ? (payload[k] as number) : Number(payload[k]));

    if (op === "register") {
      const out = await registerUser(doc, { name: str("name"), email: str("email"), phone: str("phone"), password: str("password"), referralCode: str("referral") });
      doc = out.data;
      error = out.error;
      mail = "mail" in out ? out.mail : undefined;
      if (!error && out.userId) {
        if (out.referrerId) {
          const code = doc.users.find((user) => user.id === out.referrerId)?.referralCode || str("referral");
          await recordReferral({ referredId: out.userId, referrerId: out.referrerId, code });
        }
        userId = out.userId;
        draft = null;
        await rotateSession(session.token, userId, payload.remember !== false);
      }
    } else if (op === "login") {
      const out = await loginUser(doc, str("email"), str("password"));
      error = out.error;
      if (!error && out.userId) {
        userId = out.userId;
        draft = null;
        await rotateSession(session.token, userId, payload.remember !== false);
      }
    } else if (op === "logout") {
      userId = null;
      draft = null;
      if (session.token) {
        const sql = await getSql();
        await sql`delete from shop_sessions where token = ${session.token}`;
      }
      deleteCookie(COOKIE, cookieOpts(true));
    } else if (op === "completeGoogle") {
      const out = completeGoogle(doc, draft, { name: str("name"), phone: str("phone") });
      doc = out.data;
      error = out.error;
      mail = "mail" in out ? out.mail : undefined;
      if (!error && out.userId) {
        userId = out.userId;
        draft = null;
        await rotateSession(session.token, userId);
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
      const out = await completePurchase(doc, userId, str("productId"), { phone: str("phone"), amount: num("amount"), detail: str("detail"), idempotencyKey: str("idempotencyKey") });
      doc = out.data;
      error = out.error;
      orderId = out.orderId || "";
    } else if (op === "buyAirtime") {
      const out = await completeAirtimePurchase(doc, userId, { networkId: str("networkId"), phone: str("phone"), amount: num("amount"), idempotencyKey: str("idempotencyKey") });
      doc = out.data;
      error = out.error;
    } else if (op === "refund") {
      const orderId = str("orderId");
      const before = doc.orders.find((order) => order.id === orderId);
      if (before && isServer1Number(before)) {
        error = "Cancel this number from its purchase page. A refund is only issued after FiveSim confirms cancellation.";
      } else {
      const out = refundOrder(doc, userId, orderId);
      doc = out.data;
      error = out.error;
      if (!error && before) {
        const moved = await creditBalance(before.userId, before.amount, "refund:" + before.id, "Refund · " + before.title, "refund");
        doc = { ...doc, users: doc.users.map((user) => (user.id === before.userId ? { ...user, balance: moved.balance } : user)) };
        await reverseReferral(before.userId, before.id);
      }
      }
    } else if (op === "tick") {
      doc = await syncInstakingOrders(doc);
      doc = await syncServer1Numbers(doc);
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
      doc = { ...out.data, products: [] };
      error = out.error;
      report = out.report ?? null;
      if (!error && out.data.products.length) {
        const providerId = out.report?.providerId || "";
        const rows = providerId ? out.data.products.filter((product) => product.providerId === providerId) : out.data.products;
        await upsertProductRows(rows, "manual-" + Date.now());
      }
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
      const target = str("userId");
      const note = str("note") || "Admin adjustment";
      const current = doc.users.find((user) => user.id === target);
      const out = adjustBalance(doc, userId, target, num("amount"), note);
      doc = out.data;
      error = out.error;
      mail = "mail" in out ? out.mail : undefined;
      if (!error && current) {
        const after = doc.users.find((user) => user.id === target);
        const applied = Math.round((after?.balance || 0) - current.balance);
        if (applied !== 0) {
          const ref = "adjust:" + (doc.txns[0]?.id || uid("txn"));
          const moved = applied > 0 ? await creditBalance(target, applied, ref, note, "topup") : await debitBalance(target, Math.abs(applied), ref, note);
          if (moved.ok !== false) doc = { ...doc, users: doc.users.map((user) => (user.id === target ? { ...user, balance: moved.balance } : user)) };
        }
      }
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
    return { ...result(doc, userId, draft, error, report), orderId };
  }

export async function connectGoogle(profile: { email: string; name: string }) {
  const doc = await loadLight();
  const out = upsertGoogle(doc, profile);
  const token = crypto.randomUUID();
  await writeSession(token, out.userId, out.needsPhone ? out.draft : null);
  touchCookie(token);
  return { needsPhone: out.needsPhone, role: out.userId ? doc.users.find((u) => u.id === out.userId)?.role : "customer", token };
}

async function completePurchase(doc: Data, userId: string | null, productId: string, extra: { phone?: string; amount?: number; detail?: string; idempotencyKey?: string }) {
  const found = productId ? await readProduct(productId) : null;
  const quoted = found ? quoteProduct(found, doc) : null;
  const provider = quoted && doc.providers.find((item) => item.id === quoted.providerId && item.enabled);
  if (!quoted?.enabled || !provider) return { error: "That service is not available.", data: doc };
  if (quoted.category === "airtime") return { error: "Airtime is sold from the network list, not from the catalogue. Nothing was sent.", data: doc };
  if (!smmSalesOpen() && quoted.category === "smm") return { error: SMM_CLOSED, data: doc };
  if (isRetiredBill(quoted.category)) return { error: BILL_CLOSED, data: doc };
  const sticker = quoted.price;
  const user = userId ? doc.users.find((item) => item.id === userId) : null;
  const face = quoted.variable ? Math.round(extra.amount || 0) : sticker;
  let quantity = 1;
  if (quoted.category === "smm") {
    const fields = readSmmDetail(extra.detail || "", Math.round(extra.amount || 0));
    const type = quoted.smmType || quoted.operator || "Default";
    const packaged = /^package$/i.test(type);
    const subscription = /subscription/i.test(type);
    const comments = /custom comments/i.test(type);
    const lines = String(fields.comments || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
    quantity = packaged ? 1 : comments ? lines : Math.round(Number(fields.quantity) || 0);
    if (comments && quantity <= 0) return { error: "Add the comments, one per line.", data: doc };
    if (!packaged && !subscription && !comments) {
      if (quantity <= 0) return { error: "Enter the quantity.", data: doc };
      if (quoted.smmMin && quantity < quoted.smmMin) return { error: `Minimum quantity is ${quoted.smmMin}.`, data: doc };
      if (quoted.smmMax && quantity > quoted.smmMax) return { error: `Maximum quantity is ${quoted.smmMax}.`, data: doc };
    }
    const posts = Math.round(Number(fields.posts) || 0);
    const span = Math.round(Number(fields.max) || quoted.smmMax || 0);
    if (subscription && (span <= 0 || posts <= 0)) return { error: "Set the maximum quantity and how many posts to cover.", data: doc };
    if (subscription) quantity = span * posts;
  }
  const priced = sellQuote({
    category: quoted.category,
    unitCost: quoted.cost,
    currency: provider.currency,
    usdRate: provider.usdRate || doc.settings.usdNgn,
    quantity,
    variable: quoted.variable,
    face,
    profits: profitsOf({ general: doc.settings.generalProfit, airtime: doc.settings.airtimeProfit, data: doc.settings.dataProfit }),
  });
  if (!priced.ok) return { error: priced.error, data: doc };
  const charge = priced.charge;
  if (!user) return { error: "Sign in first.", data: doc };
  if (!quoted.variable && charge <= 0) return { error: "This item has no price yet.", data: doc };
  const key = (extra.idempotencyKey || "").slice(0, 80);
  if (key) {
    const gate = await beginPurchaseKey({ key, userId: user.id, productId: quoted.id });
    if (gate === "completed") {
      const sql = await getSql();
      const previous = await sql.query<{ order_id: string }>("select order_id from shop_idempotency where key = $1", [key]);
      return { error: null, data: doc, orderId: previous[0]?.order_id || "" };
    }
    if (gate === "busy") return { error: "This purchase is already processing.", data: doc };
  }
  if (user.balance < charge) {
    if (key) await markPurchaseKey(key, "failed");
    return { error: "Insufficient balance. Top up your balance to make this purchase.", data: doc };
  }
  const providerAmount = quoted.variable ? face : quantity;
  const { resolvePurchaseCredentials } = await import("@/lib/provider-map.server");
  const credentials = await resolvePurchaseCredentials(provider.id, quoted.category);
  const apiKey = credentials.apiKey;
  if (!apiKey && quoted.category !== "vpn") {
    if (key) await markPurchaseKey(key, "failed");
    return { error: "This product is not connected to a provider with saved credentials, so the order was not sent and the wallet was not charged.", data: doc };
  }
  if (quoted.category === "vpn" && !apiKey) return { error: "VPN is coming soon.", data: doc };
  const placed = await placeOnProvider({ product: quoted, provider, apiKey, phone: extra.phone || "", amount: providerAmount, detail: extra.detail || "", clientReference: key });
  if (!placed.ok) {
    if (key) await markPurchaseKey(key, "failed");
    return { error: placed.error, data: doc };
  }
  const cost = placed.cost > 0 ? placed.cost : priced.costNgn;
  const gain = charge - cost;
  const ledgerRef = "purchase:" + (key || uid("ord"));
  const debited = await debitBalance(user.id, charge, ledgerRef, quoted.name);
  const reconcileDetail = JSON.stringify({
    title: quoted.name,
    category: quoted.category,
    server: serverLabel(doc.providers, provider.id) || provider.name,
    network: quoted.network,
    phone: placed.phone || extra.phone || "",
    cost,
    gain: charge - cost,
    code: quoted.category === "smm" ? "" : placed.ref,
    status: placed.waiting ? "waiting" : "completed",
    providerStatus: quoted.category === "smm" ? "Pending" : "",
    refillAvailable: !!quoted.smmRefill,
    detail: extra.detail || quoted.description,
  });
  if (!debited.ok) {
    if (key) await markPurchaseKey(key, "needs_reconcile", { providerOrderId: placed.ref, amount: charge, detail: reconcileDetail });
    return { error: "The provider accepted the order, but the wallet update did not finish. It is flagged for reconciliation and will not be charged twice.", data: doc };
  }
  const numberLike = quoted.category === "number" || quoted.category === "numbers" || quoted.category === "rent" || quoted.category === "usa";
  const delivery = placed.delivery || "";
  const providerRef = placed.providerRef || (numberLike ? placed.ref : "");
  const ready = { ...doc, products: [quoted], users: doc.users.map((item) => (item.id === user.id ? { ...item, balance: debited.balance + charge } : item)) };
  const bought = buyProduct(ready, userId, quoted.id, {
    phone: placed.phone || extra.phone,
    amount: quoted.variable ? face : charge,
    charge,
    detail: extra.detail,
    cost,
    gain: charge - cost,
    code: numberLike || quoted.category === "smm" ? "" : delivery || placed.ref,
    providerOrderId: quoted.category === "smm" ? placed.ref : providerRef,
    providerStatus: quoted.category === "smm" ? "Pending" : "",
    refillAvailable: !!quoted.smmRefill,
    status: placed.waiting ? "waiting" : "completed",
    delivery,
    country: quoted.country,
    service: quoted.service,
  });
  if (bought.error) {
    if (key) await markPurchaseKey(key, "needs_reconcile", { providerOrderId: placed.ref, amount: charge, detail: reconcileDetail });
    return { error: "The provider accepted the order. The wallet debit is recorded and the order will be reconciled.", data: doc };
  }
  const data = {
    ...bought.data,
    products: [] as Data["products"],
    users: bought.data.users.map((item) => (item.id === user.id ? { ...item, balance: debited.balance } : item)),
  };
  if (key) await markPurchaseKey(key, "completed", { orderId: data.orders[0]?.id || "", providerOrderId: placed.ref, amount: charge, detail: reconcileDetail });
  await decrementStock(quoted.id);
  const order = data.orders[0];
  if (order) {
    try {
      const host = (() => { try { return new URL(provider.baseUrl).hostname; } catch { return provider.name; } })();
      const { rememberFulfilment } = await import("@/lib/fulfilment.server");
      await rememberFulfilment({
        orderId: order.id,
        userId: user.id,
        category: order.category,
        title: order.title,
        providerId: provider.id,
        provider: host,
        providerRef: order.providerOrderId || "",
        phone: order.phone || "",
        country: order.country || "",
        service: order.service || "",
        delivery: order.delivery || order.code || "",
        status: order.status,
      });
    } catch (err) {
      console.error("fulfilment save skipped", err instanceof Error ? err.message : err);
    }
  }
  if (order && order.status === "completed") {
    await settleReferral({ buyerId: user.id, orderId: order.id, amount: charge, profit: gain, orderStatus: order.status });
  }
  return { error: null, data, orderId: order?.id || "" };
}

export async function completeAirtimePurchase(doc: Data, userId: string | null, input: { networkId: string; phone: string; amount: number; idempotencyKey?: string }) {
  if (!airtimeSalesOpen()) return { error: AIRTIME_CLOSED, data: doc };
  const user = userId ? doc.users.find((item) => item.id === userId) : null;
  if (!user) return { error: "Sign in first.", data: doc };
  const records = await listAirtimeRecords();
  const network = records.networks.find((item) => item.id === input.networkId);
  if (!network?.enabled) return { error: "That network is not available.", data: doc };
  const routes = records.routes.filter((route) => route.networkId === network.id && route.enabled);
  if (routes.length !== 1) return { error: "That network is not available.", data: doc };
  const route = routes[0];
  const provider = doc.providers.find((item) => item.id === route.providerId && item.enabled);
  if (!provider) return { error: "The airtime provider is turned off.", data: doc };
  const phone = input.phone.trim();
  if (phone.length < 8) return { error: "Enter the phone number.", data: doc };
  const face = Math.round(Number(input.amount) || 0);
  if (face < network.minAmount || face > network.maxAmount) {
    return { error: `${network.name} airtime must be between ₦${network.minAmount.toLocaleString("en-NG")} and ₦${network.maxAmount.toLocaleString("en-NG")}.`, data: doc };
  }
  const profit = network.profitNaira == null ? profitsOf({ airtime: doc.settings.airtimeProfit }).airtime : network.profitNaira;
  const priced = airtimeCharge(face, profit);
  if (!priced.ok) return { error: priced.error, data: doc };
  const charge = priced.charge;
  const key = (input.idempotencyKey || "").slice(0, 80);
  if (key) {
    const gate = await beginPurchaseKey({ key, userId: user.id, productId: network.id });
    if (gate === "completed") return { error: null, data: doc };
    if (gate === "busy") return { error: "This purchase is already processing.", data: doc };
  }
  if (user.balance < charge) {
    if (key) await markPurchaseKey(key, "failed");
    return { error: "Insufficient balance. Top up your balance to make this purchase.", data: doc };
  }
  const apiKey = await readProviderKey(provider.id);
  const ref = "VL" + ((key || uid("air")).replace(/[^A-Za-z0-9]/g, "").slice(0, 24) || Date.now().toString(36));
  const prepared = prepareAirtimePurchase({ baseUrl: provider.baseUrl, apiKey, route, phone, amount: face, ref });
  if (!prepared.ok) {
    if (key) await markPurchaseKey(key, "failed");
    return { error: prepared.error, data: doc };
  }
  const sent = await sendAirtimePurchase(prepared, apiKey);
  if (!sent.ok) {
    if (key) await markPurchaseKey(key, "failed");
    return { error: sent.error, data: doc };
  }
  const providerRef = sent.ref || ref;
  const ledgerRef = "purchase:" + (key || uid("ord"));
  const debited = await debitBalance(user.id, charge, ledgerRef, `${network.name} Airtime`);
  const reconcileDetail = JSON.stringify({ title: `${network.name} Airtime`, category: "airtime", network: network.name, phone, cost: face, gain: priced.profit, code: providerRef, status: "completed" });
  if (!debited.ok) {
    if (key) await markPurchaseKey(key, "needs_reconcile", { providerOrderId: providerRef, amount: charge, detail: reconcileDetail });
    return { error: "The provider accepted the order, but the wallet update did not finish. It is flagged for reconciliation and will not be charged twice.", data: doc };
  }
  const ready = { ...doc, users: doc.users.map((item) => (item.id === user.id ? { ...item, balance: debited.balance + charge } : item)) };
  const bought = recordAirtimeOrder(ready, userId, {
    networkId: network.id,
    title: `${network.name} Airtime`,
    providerId: provider.id,
    network: network.name,
    phone,
    charge,
    cost: face,
    gain: priced.profit,
    ref: providerRef,
  });
  if (bought.error || !("order" in bought) || !bought.order) {
    if (key) await markPurchaseKey(key, "needs_reconcile", { providerOrderId: providerRef, amount: charge, detail: reconcileDetail });
    return { error: "The provider accepted the order. The wallet debit is recorded and the order will be reconciled.", data: doc };
  }
  const data = { ...bought.data, users: bought.data.users.map((item) => (item.id === user.id ? { ...item, balance: debited.balance } : item)) };
  if (key) await markPurchaseKey(key, "completed", { orderId: bought.order.id, providerOrderId: providerRef, amount: charge, detail: reconcileDetail });
  await settleReferral({ buyerId: user.id, orderId: bought.order.id, amount: charge, profit: priced.profit, orderStatus: "completed" });
  return { error: null, data };
}

function fiveSimProvider(doc: Data) {
  const rows = doc.providers.filter((item) => item.enabled && /5sim\.net/i.test(item.baseUrl || ""));
  return rows.find((item) => item.serverId === "1") || rows[0] || null;
}

export async function buyRentNumber(offerId: string, idempotencyKey = "") {
  const session = await readSession();
  if (!session.userId) return { error: "Sign in first.", orderId: "", state: null as Data | null };
  const { readRentOffer, readRentPricing, rentCountryName, rentGroups } = await import("@/lib/rent.server");
  const { fiveSimBuyUrl } = await import("@/lib/rent");
  const offer = await resolveRentOffer(offerId, readRentOffer, rentGroups);
  if (!offer) return { error: "That rent option is no longer in the catalogue.", orderId: "", state: null };
  const doc = await loadLight();
  const provider = fiveSimProvider(doc);
  const key = provider ? await readProviderKey(provider.id) : "";
  if (!provider || !key) return { error: "FiveSim is not connected for Rent numbers. Nothing was sent.", orderId: "", state: null };
  const user = doc.users.find((item) => item.id === session.userId);
  if (!user) return { error: "Sign in first.", orderId: "", state: null };
  const pricing = await readRentPricing();
  const charge = rentCharge(offer.priceUsd, pricing);
  if (charge == null) return { error: "This number cannot be bought right now.", orderId: "", state: null };
  const idem = String(idempotencyKey || "").replace(/[^a-zA-Z0-9:_-]/g, "").slice(0, 80);
  if (!idem) return { error: "Start the rental again. Nothing was sent.", orderId: "", state: null };
  const gate = await beginPurchaseKey({ key: idem, userId: user.id, productId: `rent:${offer.id}`.slice(0, 80) });
  if (gate === "completed") {
    const sql = await getSql();
    const previous = await sql.query<{ order_id: string }>("select order_id from shop_idempotency where key = $1", [idem]);
    return { error: null as string | null, orderId: previous[0]?.order_id || "", state: projectShop(doc, session.userId, session.draft) };
  }
  if (gate === "busy") return { error: "This rental is already processing.", orderId: "", state: null };
  if (user.balance < charge) {
    await markPurchaseKey(idem, "failed");
    return { error: "Insufficient balance. Top up your balance to make this purchase.", orderId: "", state: null };
  }
  let res: Response;
  try {
    res = await fetch(fiveSimBuyUrl(offer), { headers: { Authorization: "Bearer " + key, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  } catch {
    await markPurchaseKey(idem, "failed");
    return { error: "FiveSim could not be reached. The wallet was not charged.", orderId: "", state: null };
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text) as Record<string, unknown>; } catch { json = {}; }
  const phone = typeof json.phone === "string" ? json.phone : "";
  const providerRef = String(json.id || "");
  if (!res.ok || !phone || !providerRef) {
    await markPurchaseKey(idem, "failed");
    const raw = String(json.message || text || "FiveSim refused the rental.").slice(0, 180);
    return { error: raw || "FiveSim refused the rental. The wallet was not charged.", orderId: "", state: null };
  }
  const countryName = (await rentCountryName(offer.country)) || offer.country;
  const title = `Rent number · ${offer.service} · ${countryName}`;
  const ledgerRef = "purchase:" + idem;
  const debited = await debitBalance(user.id, charge, ledgerRef, title);
  if (!debited.ok) {
    await markPurchaseKey(idem, "needs_reconcile", { providerOrderId: providerRef, amount: charge, detail: title });
    return { error: "FiveSim accepted the rental, but the wallet update did not finish. It is flagged for reconciliation and will not be charged twice.", orderId: "", state: null };
  }
  const ready = { ...doc, users: doc.users.map((item) => (item.id === user.id ? { ...item, balance: debited.balance + charge } : item)) };
  const bought = recordRentOrder(ready, user.id, {
    offerId: offer.id,
    title,
    country: countryName,
    service: offer.service,
    kind: offer.kind,
    phone,
    charge,
    cost: Math.round(offer.priceUsd * pricing.usdNgn),
    gain: charge - Math.round(offer.priceUsd * pricing.usdNgn),
    providerRef,
    providerStatus: String(json.status || "PENDING"),
    providerUsd: offer.priceUsd,
  });
  if (bought.error || !("order" in bought) || !bought.order) {
    await markPurchaseKey(idem, "needs_reconcile", { providerOrderId: providerRef, amount: charge, detail: title });
    return { error: "FiveSim accepted the rental. The wallet debit is recorded and the order will be reconciled.", orderId: "", state: null };
  }
  const data = { ...bought.data, users: bought.data.users.map((item) => (item.id === user.id ? { ...item, balance: debited.balance } : item)) };
  await markPurchaseKey(idem, "completed", { orderId: bought.order.id, providerOrderId: providerRef, amount: charge, detail: title });
  try {
    const { rememberFulfilment } = await import("@/lib/fulfilment.server");
    await rememberFulfilment({
      orderId: bought.order.id,
      userId: user.id,
      category: "rent",
      title,
      providerId: provider.id,
      provider: "5sim.net",
      providerRef,
      phone,
      country: countryName,
      service: offer.service,
      delivery: "",
      status: "waiting",
    });
  } catch (err) {
    console.error("rent fulfilment skipped", err instanceof Error ? err.message : err);
  }
  await saveDoc(data);
  return { error: null as string | null, orderId: bought.order.id, state: projectShop(data, session.userId, session.draft) };
}

function server1Provider(doc: Data) {
  return doc.providers.find((item) => item.enabled && item.serverId === "1" && /5sim\.net/i.test(item.baseUrl || ""));
}

function isServer1Number(order: { server?: string; category?: string }) {
  return order.server === "Server 1" && (order.category === "number" || order.category === "numbers");
}

async function fiveSimCall(key: string, path: string) {
  const res = await fetch(`https://5sim.net/v1/user/${path}`, {
    headers: { Authorization: "Bearer " + key, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json: unknown = {};
  try { json = JSON.parse(text); } catch { json = {}; }
  return { ok: res.ok, text, json };
}

async function applyFiveSim(doc: Data, orderId: string, pulled: { phone: string; status: string; messages: { at: string; sender: string; text: string; code: string }[] }) {
  const { mapFiveSimStatus } = await import("@/lib/fivesim-status");
  const { mergeMessages } = await import("@/lib/fulfilment");
  const order = doc.orders.find((item) => item.id === orderId);
  if (!order) return doc;
  const next = mapFiveSimStatus(pulled.status);
  if (next === "unknown") return doc;
  const messages = mergeMessages(order.messages || [], pulled.messages);
  const code = messages.map((item) => item.code).filter(Boolean).pop() || order.code;
  const status = next === "waiting" ? order.status : next;
  const updated = {
    ...order,
    phone: pulled.phone || order.phone,
    code,
    messages,
    providerStatus: pulled.status || order.providerStatus,
    status,
  };
  let nextDoc = { ...doc, orders: doc.orders.map((item) => item.id === orderId ? updated : item) };
  if (status === "refunded" && order.status !== "refunded") {
    const moved = await creditBalance(order.userId, order.amount, "refund:" + order.id, "Refund · " + order.title, "refund");
    nextDoc = {
      ...nextDoc,
      users: nextDoc.users.map((user) => user.id === order.userId ? { ...user, balance: moved.balance } : user),
    };
    await reverseReferral(order.userId, order.id);
  }
  return nextDoc;
}

async function syncServer1Order(doc: Data, orderId: string) {
  const order = doc.orders.find((item) => item.id === orderId);
  if (!order || !isServer1Number(order) || order.status === "completed" || order.status === "refunded") return doc;
  const provider = server1Provider(doc);
  const key = provider ? await readProviderKey(provider.id) : "";
  const ref = String(order.providerOrderId || "").replace(/[^\d]/g, "");
  if (!key || !ref) return doc;
  try {
    const called = await fiveSimCall(key, `check/${ref}`);
    if (!called.ok) return doc;
    const { parseFiveSimCheck } = await import("@/lib/fulfilment");
    const pulled = parseFiveSimCheck(called.json);
    return applyFiveSim(doc, orderId, pulled);
  } catch {
    return doc;
  }
}

export async function syncServer1Numbers(doc: Data) {
  let next = doc;
  const waiting = doc.orders.filter((order) => isServer1Number(order) && order.status === "waiting").slice(0, 20);
  for (const order of waiting) next = await syncServer1Order(next, order.id);
  return next;
}

export async function cancelServer1Number(orderId: string) {
  const session = await readSession();
  if (!session.userId) return { error: "Sign in first.", state: null as Data | null };
  const doc = await loadLight();
  const me = doc.users.find((user) => user.id === session.userId);
  const order = doc.orders.find((item) => item.id === orderId);
  if (!me || !order || (order.userId !== me.id && me.role !== "admin")) return { error: "That purchase was not found.", state: null };
  if (!isServer1Number(order)) return { error: "This purchase is not a FiveSim Server 1 number.", state: null };
  if (order.status === "refunded") return { error: null, state: projectShop(doc, session.userId, session.draft) };
  if (order.status === "completed" || order.status === "received") return { error: "FiveSim has already completed this number. It cannot be cancelled or refunded.", state: projectShop(doc, session.userId, session.draft) };
  const provider = server1Provider(doc);
  const key = provider ? await readProviderKey(provider.id) : "";
  const ref = String(order.providerOrderId || "").replace(/[^\d]/g, "");
  if (!key || !ref) return { error: "This number has no FiveSim order id, so it was not cancelled.", state: null };
  const { fiveSimCancelDecision } = await import("@/lib/fivesim-status");
  const { parseFiveSimCheck } = await import("@/lib/fulfilment");
  let checked;
  try {
    checked = await fiveSimCall(key, `check/${ref}`);
  } catch {
    return { error: "FiveSim could not be reached. Nothing was refunded. Try again.", state: null };
  }
  if (!checked.ok) return { error: "FiveSim did not confirm the order status. Nothing was refunded.", state: null };
  const current = parseFiveSimCheck(checked.json);
  const decision = fiveSimCancelDecision(current.status);
  if (decision === "already_done") {
    const synced = await applyFiveSim(doc, order.id, current);
    await saveDoc(synced);
    return { error: "FiveSim has already completed this number. It cannot be cancelled or refunded.", state: projectShop(synced, session.userId, session.draft) };
  }
  if (decision === "already_canceled") {
    const synced = await applyFiveSim(doc, order.id, current);
    await saveDoc(synced);
    return { error: null, state: projectShop(synced, session.userId, session.draft) };
  }
  if (decision !== "cancel") return { error: "FiveSim did not confirm that this number can be cancelled. Nothing was refunded.", state: null };
  let canceled;
  try {
    canceled = await fiveSimCall(key, `cancel/${ref}`);
  } catch {
    return { error: "FiveSim timed out. Nothing was refunded. The order is left for reconciliation.", state: null };
  }
  if (!canceled.ok) return { error: "FiveSim refused the cancellation. Nothing was refunded.", state: null };
  const result = parseFiveSimCheck(canceled.json);
  if (fiveSimCancelDecision(result.status) !== "already_canceled") {
    return { error: "FiveSim did not confirm the cancellation. Nothing was refunded.", state: null };
  }
  const synced = await applyFiveSim(doc, order.id, result);
  await saveDoc(synced);
  return { error: null, state: projectShop(synced, session.userId, session.draft) };
}

async function fiveSimOrderCall(orderId: string, action: "cancel" | "finish") {
  const session = await readSession();
  if (!session.userId) return { error: "Sign in first." as string, state: null as Data | null };
  const doc = await loadLight();
  const me = doc.users.find((user) => user.id === session.userId);
  const order = doc.orders.find((item) => item.id === orderId);
  if (!me || !order || (order.userId !== me.id && me.role !== "admin") || order.server !== "Rent number") return { error: "That rental was not found.", state: null };
  const provider = fiveSimProvider(doc);
  const key = provider ? await readProviderKey(provider.id) : "";
  const ref = String(order.providerOrderId || "").replace(/[^\d]/g, "");
  if (!key || !ref) return { error: "This rental has no FiveSim reference.", state: null };
  let res: Response;
  try {
    res = await fetch(`https://5sim.net/v1/user/${action}/${ref}`, { headers: { Authorization: "Bearer " + key, Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  } catch {
    return { error: "FiveSim could not be reached.", state: null };
  }
  const text = await res.text();
  if (!res.ok) return { error: text.slice(0, 180) || "FiveSim refused that request.", state: null };
  return { error: null as string | null, state: doc, order, session };
}

export async function cancelRentNumber(orderId: string) {
  const called = await fiveSimOrderCall(orderId, "cancel");
  if (called.error || !called.order || !called.state) return { error: called.error || "Could not cancel.", state: null as Data | null };
  const before = called.order;
  const out = refundOrder(called.state, called.session?.userId || null, before.id);
  if (out.error) return { error: out.error, state: null };
  const moved = await creditBalance(before.userId, before.amount, "refund:" + before.id, "Refund · " + before.title, "refund");
  const data = { ...out.data, users: out.data.users.map((user) => (user.id === before.userId ? { ...user, balance: moved.balance } : user)) };
  await reverseReferral(before.userId, before.id);
  await saveDoc(data);
  const session = await readSession();
  return { error: null as string | null, state: projectShop(data, session.userId, session.draft) };
}

export async function finishRentNumber(orderId: string) {
  const called = await fiveSimOrderCall(orderId, "finish");
  if (called.error || !called.order || !called.state) return { error: called.error || "Could not finish.", state: null as Data | null };
  const data = {
    ...called.state,
    orders: called.state.orders.map((order) => order.id === called.order?.id ? { ...order, status: "completed" as const, providerStatus: "FINISHED" } : order),
  };
  await saveDoc(data);
  const session = await readSession();
  return { error: null as string | null, state: projectShop(data, session.userId, session.draft) };
}

export async function quoteRentServices(country: string) {
  const session = await readSession();
  if (!session.userId) return { error: "Sign in first.", services: [] as { id: string; service: string; stock: number; price: number; rate: number | null }[] };
  const { readRentPricing, rentGroups } = await import("@/lib/rent.server");
  const { rentSlug } = await import("@/lib/rent");
  const slug = rentSlug(country);
  const pricing = await readRentPricing();
  const groups = slug ? await rentGroups(slug) : [];
  if (groups.length && rentCharge(groups[0].chosen.priceUsd, pricing) == null) {
    return { error: "Prices are not available right now.", services: [] as { id: string; service: string; stock: number; price: number; rate: number | null }[] };
  }
  const services = [];
  for (const group of groups) {
    const price = rentCharge(group.chosen.priceUsd, pricing);
    if (price == null) continue;
    services.push({
      id: `group|${slug}|${group.key}`,
      service: group.label,
      stock: group.chosen.stock,
      price,
      rate: group.chosen.rate && group.chosen.rate > 0 ? group.chosen.rate : null,
    });
  }
  return { error: null as string | null, services };
}

async function resolveRentOffer(
  offerId: string,
  readRentOffer: (id: string) => Promise<{ id: string; country: string; service: string; operator: string; kind: "activation" | "hosting"; priceUsd: number; stock: number; rate?: number | null } | null>,
  rentGroups: (country: string) => Promise<{ key: string; chosen: { id: string; country: string; service: string; operator: string; kind: "activation" | "hosting"; priceUsd: number; stock: number; rate?: number | null } }[]>,
) {
  if (offerId.startsWith("group|")) {
    const rest = offerId.slice("group|".length);
    const cut = rest.indexOf("|");
    if (cut <= 0) return null;
    const groups = await rentGroups(rest.slice(0, cut));
    return groups.find((group) => group.key === rest.slice(cut + 1))?.chosen || null;
  }
  const row = await readRentOffer(offerId);
  return row && row.stock > 0 ? row : null;
}

export async function rentLinkStatus() {
  const doc = await loadLight();
  const provider = fiveSimProvider(doc);
  const key = provider ? await readProviderKey(provider.id) : "";
  let host = "";
  try {
    host = provider?.baseUrl ? new URL(provider.baseUrl).host : "";
  } catch {
    host = "";
  }
  return { connected: Boolean(provider && key), host, serverId: provider?.serverId || "", name: provider?.name || "" };
}

async function withDepositCashback(doc: Data, userId: string, deposit: number, reference: string) {
  try {
    const paid = await settleDepositCashback({ userId, deposit, depositRef: reference, status: "success" });
    if (!paid.awarded) return doc;
    return {
      ...doc,
      users: doc.users.map((user) => (user.id === userId ? { ...user, balance: paid.balance } : user)),
      txns: [{ id: uid("txn"), userId, kind: "topup" as const, amount: paid.amount, note: REFERRAL_CASHBACK_NOTE, createdAt: new Date().toISOString() }, ...doc.txns],
    };
  } catch (err) {
    console.error("Referral deposit cashback skipped", err instanceof Error ? err.message : err);
    return doc;
  }
}

async function finishPaidNumber(doc: Data, userId: string, productId: string, reference = "") {
  if (!productId) return { data: doc, bought: false, error: null as string | null, orderId: "" };
  const bought = await completePurchase(doc, userId, productId, { idempotencyKey: reference ? `paystack:${reference}` : "" });
  if (bought.error) return { data: doc, bought: false, error: `Payment is in your wallet. ${bought.error}`, orderId: "" };
  return { data: bought.data, bought: true, error: null, orderId: bought.orderId || "" };
}

export async function openPurchase(orderId: string, refresh: boolean) {
  const session = await readSession();
  if (!session.userId) return { error: "Sign in first.", view: null };
  let doc = await loadLight();
  const me = doc.users.find((user) => user.id === session.userId);
  if (!me) return { error: "Sign in first.", view: null };
  let order = doc.orders.find((item) => item.id === orderId);
  if (!order || (order.userId !== me.id && me.role !== "admin")) return { error: "That purchase was not found on this account.", view: null };
  const { messagesFrom, pullProviderSms, readFulfilment, saveFulfilmentMessages } = await import("@/lib/fulfilment.server");
  const { mergeMessages, purchaseView } = await import("@/lib/fulfilment");
  const row = await readFulfilment(orderId).catch(() => null);
  let messages = mergeMessages(order.messages || [], row ? messagesFrom(row.messages) : []);
  let providerNote = "";
  let providerStatus = order.providerStatus || "";
  const numberLike = order.category === "number" || order.category === "numbers" || order.category === "rent" || order.category === "usa";
  const reference = order.providerOrderId || row?.provider_ref || "";
  if (isServer1Number(order) && order.status === "waiting") {
    doc = await syncServer1Order(doc, order.id);
    order = doc.orders.find((item) => item.id === orderId) || order;
    messages = mergeMessages(messages, order.messages || []);
    providerStatus = order.providerStatus || providerStatus;
  }
  let terminal = /RECEIVED|CANCELED|CANCELLED|TIMEOUT|FINISHED|BANNED|complete|expire/i.test(order.providerStatus || "");
  if (refresh && numberLike && order.status === "waiting" && reference && !terminal) {
    const key = row?.provider_id ? await readProviderKey(row.provider_id) : "";
    const pulled = await pullProviderSms({ provider: row?.provider || "", apiKey: key, providerRef: reference });
    providerNote = pulled.supported ? pulled.error : "";
    if (pulled.messages.length || pulled.phone || pulled.status) {
      messages = mergeMessages(messages, pulled.messages);
      if (pulled.status) providerStatus = pulled.status;
      terminal = pulled.terminal;
    }
  }
  const code = messages.map((item) => item.code).filter(Boolean).pop() || "";
  const nextStatus = numberLike && code && terminal ? "received" : order.status;
  const phone = order.phone || row?.phone || "";
  const changed = code !== (order.code || "") || nextStatus !== order.status || providerStatus !== (order.providerStatus || "") || messages.length !== (order.messages || []).length || (!!row?.phone && !order.phone);
  let current = order;
  if (changed) {
    current = {
      ...order,
      phone,
      code: numberLike ? code : order.code,
      status: nextStatus,
      providerStatus,
      messages,
    };
    const saved = current;
    const next = { ...doc, orders: doc.orders.map((item) => (item.id === saved.id ? saved : item)) };
    await saveDoc(next);
    if (row) await saveFulfilmentMessages(saved.id, messages, { phone: saved.phone, status: saved.status }).catch(() => undefined);
  }
  const view = purchaseView({
    ...current,
    phone: current.phone || row?.phone || "",
    country: current.country || row?.country || "",
    service: current.service || row?.service || "",
    delivery: current.delivery || row?.delivery || "",
    providerOrderId: current.providerOrderId || row?.provider_ref || "",
    providerStatus,
    messages,
  }, messages, { admin: me.role === "admin" });
  return { error: null as string | null, view: providerNote ? { ...view, note: providerNote } : view };
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

function nairaCredit(data: { currency?: string; amount?: number; metadata?: { credit?: number } }) {
  const currency = String(data.currency || "").toUpperCase();
  if (currency !== "NGN") return { error: "Only a naira payment can fund the wallet." };
  const charged = Math.round(Number(data.amount || 0) / 100);
  const credit = Math.round(Number(data.metadata?.credit || 0));
  if (charged < 100) return { error: "Paystack amount is too small." };
  if (credit > charged) return { error: "Payment amount does not match the wallet credit." };
  return { amount: credit > 0 ? credit : charged };
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
  const body = (await res.json()) as { status?: boolean; data?: { status?: string; currency?: string; amount?: number; metadata?: { userId?: string; credit?: number; productId?: string } } };
  if (!body.status || body.data?.status !== "success") return { error: "Paystack has not confirmed this payment." };
  const userId = body.data.metadata?.userId;
  if (!userId) return { error: "Payment is missing the account it belongs to." };
  if (expect && expect !== userId) return { error: "This payment belongs to another account." };
  const priced = nairaCredit(body.data);
  if ("error" in priced) return { error: priced.error };
  const amount = priced.amount;
  return locked(async () => {
    const doc = await loadLight();
    const out = creditVerified(doc, userId, amount, reference);
    if (out.error) return { error: out.error };
    let funded = out.data;
    if (!("already" in out) || !out.already) {
      const moved = await creditBalance(userId, amount, "paystack:" + reference, "Paystack · " + reference, "topup");
      funded = { ...out.data, users: out.data.users.map((user) => (user.id === userId ? { ...user, balance: moved.balance } : user)) };
    }
    funded = await withDepositCashback(funded, userId, amount, reference);
    const finished = await finishPaidNumber(funded, userId, body.data?.metadata?.productId || "", reference);
    await saveDoc(finished.data);
    await sendMail(out.mail);
    const session = await readSession();
    return { error: finished.error, bought: finished.bought, orderId: finished.orderId, state: projectShop(finished.data, session.userId, session.draft) };
  });
}

export async function creditFromWebhook(raw: string, signature: string | null) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!paystackSignatureOk(raw, signature, secret || "")) {
    try {
      const { recordWebhook } = await import("@/lib/fulfilment.server");
      await recordWebhook({ provider: "paystack", eventKey: `rejected:${Date.now().toString(36)}`, status: "rejected", summary: "Rejected signature", error: secret ? "Bad signature" : "Secret missing" });
    } catch {
      /* logging must not change the rejection */
    }
    return false;
  }
  let event: { event?: string; data?: { reference?: string; status?: string; currency?: string; amount?: number; metadata?: { userId?: string; credit?: number; productId?: string } } };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return false;
  }
  if (event.event !== "charge.success" || event.data?.status !== "success" || !event.data.reference || !event.data.metadata?.userId) return true;
  const priced = nairaCredit(event.data);
  if ("error" in priced) {
    console.error("Paystack webhook was signed but not credited:", priced.error);
    return true;
  }
  const amount = priced.amount;
  const reference = event.data.reference;
  const paidUser = event.data.metadata.userId;
  const productId = event.data.metadata.productId || "";
  let logged: "ok" | "failed" = "failed";
  await locked(async () => {
    const doc = await loadLight();
    const out = creditVerified(doc, paidUser, amount, reference);
    if (out.error) return;
    logged = "ok";
    let funded = out.data;
    if (!("already" in out) || !out.already) {
      const moved = await creditBalance(paidUser, amount, "paystack:" + reference, "Paystack · " + reference, "topup");
      funded = { ...out.data, users: out.data.users.map((user) => (user.id === paidUser ? { ...user, balance: moved.balance } : user)) };
    }
    funded = await withDepositCashback(funded, paidUser, amount, reference);
    const finished = await finishPaidNumber(funded, paidUser, productId, reference);
    await saveDoc(finished.data);
    await sendMail(out.mail);
  });
  try {
    const { recordWebhook } = await import("@/lib/fulfilment.server");
    await recordWebhook({ provider: "paystack", eventKey: reference, status: logged, summary: `charge.success ${reference}`, error: logged === "failed" ? "Not credited" : "" });
  } catch (err) {
    console.error("paystack webhook log skipped", err instanceof Error ? err.message : err);
  }
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

export async function pullRemote(input: { url: string; apiKey?: string; providerId?: string; allow?: string[]; kind?: ImportKind; setup?: CatalogSetup | null }) {
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
  const blocked = airtimeImportBlock(input.kind || "", url.toString());
  if (blocked) return { ok: false as const, error: blocked };
  const key = input.apiKey?.trim() || (input.providerId ? await readProviderKey(input.providerId) : "");
  const headers: Record<string, string> = { Accept: "application/json" };
  const host = url.hostname.replace(/^www\./, "");
  if (/(^|\.)getatext\.com$/i.test(host) && looksLikePurchase(url.toString())) {
    return { ok: false as const, error: "That address rents a number. Catalogue import will not call it." };
  }
  const catalogue = getatextCatalogueUrl(url.toString());
  if (catalogue) url = new URL(catalogue);
  if (key && /(^|\.)getatext\.com$/i.test(host)) headers.Auth = key;
  else if (key && /smeapi\.com\.ng$/i.test(host)) headers.Authorization = `Token ${key}`;
  else if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers["X-API-KEY"] = key;
    headers["api-key"] = key;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 180000);
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
    const barePrices = fiveSimImportPlan(url.toString(), allow) === "fanout";
    if (barePrices) {
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
      return { ok: true as const, payload: slimFiveSim(merged, "", allow, {}), services: discoverServiceNames(merged) };
    }
    if (input.kind === "vtu-data" || input.kind === "vtu") {
      const catalogue = vtuCatalogueUrl(url.toString());
      if (catalogue) {
        try {
          const listed = await fetch(catalogue, { method: "GET", headers, signal: ctrl.signal });
          const listedText = await listed.text();
          if (!listed.ok || !listedText) return { ok: false as const, error: "That address places an order. The plan list could not be read, so nothing was imported." };
          try {
            return { ok: true as const, payload: JSON.parse(listedText) as unknown };
          } catch {
            return { ok: false as const, error: "The plan list did not come back as JSON, so nothing was imported." };
          }
        } catch {
          return { ok: false as const, error: "The plan list could not be reached, so nothing was imported." };
        }
      }
      if (/\/data\/?$/i.test(url.pathname) || looksLikePurchase(url.toString())) {
        return { ok: false as const, error: "That address places an order. Catalogue import will not call it." };
      }
    }
    const probe = await probeProviderCatalogue({
      url: url.toString(),
      apiKey: key,
      providerId: input.providerId,
      draft: input.setup,
      timeoutMs: 45000,
    });
    const providerName = doc.providers.find((item) => item.id === input.providerId)?.name || "";
    const fetchReport = reportOf(probe, publicEndpoint(url.toString()), providerName);
    if (!probe.ok || probe.payload == null) return { ok: false as const, error: probe.error || "The API did not return a catalogue.", fetch: fetchReport };
    let payload: unknown = applyFieldMap(probe.payload, probe.setup.fieldMap);
    const method = (probe.method || "GET") as CatalogMethod;
    if (!url.hostname.endsWith("5sim.net")) {
      try {
        payload = await followCatalogPages(url, payload, async (target) => {
          if (target.hostname !== url.hostname) return null;
          if (looksLikePurchase(target.toString())) return null;
          return readCataloguePage(target.toString(), method, probe.setup, key, 20000);
        });
      } catch {
        // A later page can fail. The pages already read stay in the payload.
      }
    }
    const hint = /hosting|rent/i.test(url.search + url.pathname) ? "hosting" : "";
    const parts = url.pathname.split("/").filter(Boolean);
    const at = parts.findIndex((part) => part === "products");
    const place = at >= 0 ? { country: parts[at + 1] || "", operator: parts[at + 2] || "any" } : {};
    const ready = url.hostname.endsWith("5sim.net") ? slimFiveSim(payload, hint, allow, place) : payload;
    const services = url.hostname.endsWith("5sim.net") ? discoverServiceNames(payload) : [];
    if (/(^|\.)getatext\.com$/i.test(host)) {
      const prices = readGetaTextPrices(ready);
      if (prices?.recognized) {
        if (!prices.rows.length) return { ok: false as const, error: "GetaText did not return any USA services.", fetch: fetchReport };
        return { ok: true as const, payload: prices.rows, fetch: fetchReport, setup: probe.setup, services };
      }
      const flat = flattenGetaText(ready);
      if (flat) return { ok: true as const, payload: flat, fetch: fetchReport, setup: probe.setup, services };
    }
    return { ok: true as const, payload: ready, fetch: fetchReport, setup: probe.setup, services };
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

export async function browseRemoteCatalog(input: { url: string; apiKey?: string; providerId?: string; cursor?: string; q?: string; setup?: CatalogSetup | null }) {
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
  const blocked = airtimeImportBlock("", start.toString());
  if (blocked) return emptyBrowse(blocked);
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
  if (looksLikePurchase(pageUrl.toString())) return emptyBrowse("That address places an order. Catalogue browse will not call it.");
  const catalogue = getatextCatalogueUrl(pageUrl.toString());
  if (catalogue) pageUrl = new URL(catalogue);
  try {
    const probe = await probeProviderCatalogue({
      url: pageUrl.toString(),
      apiKey: key,
      providerId: input.providerId,
      draft: input.setup,
      timeoutMs: 20000,
    });
    if (!probe.ok || probe.payload == null) return emptyBrowse(probe.error || "That page did not come back as JSON.");
    const method = (probe.method || "GET") as CatalogMethod;
    const first = applyFieldMap(probe.payload, probe.setup.fieldMap);
    const readJson = async (target: URL) => {
      if (target.hostname !== start.hostname) return null;
      if (looksLikePurchase(target.toString())) return null;
      const clean = new URL(target);
      clean.searchParams.delete("vl_from");
      return readCataloguePage(clean.toString(), method, probe.setup, key, 15000);
    };
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
  }
}

export async function openCatalogSetup(providerId: string) {
  const session = await readSession();
  const doc = await loadLight();
  const me = doc.users.find((u) => u.id === session.userId);
  if (me?.role !== "admin") return { error: "Only an admin can read a provider setup.", setup: null };
  return { error: null as string | null, setup: setupView(await loadProviderFetch(providerId)) };
}

export async function testCatalogConnection(input: { url: string; apiKey?: string; providerId?: string; setup?: CatalogSetup | null }) {
  const session = await readSession();
  const doc = await loadLight();
  const me = doc.users.find((u) => u.id === session.userId);
  if (me?.role !== "admin") return { error: "Only an admin can test an API.", report: null as FetchReport | null };
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return { error: "Enter a full https address.", report: null };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Only http and https catalogues can be tested.", report: null };
  const blocked = airtimeImportBlock("", input.url);
  if (blocked) return { error: blocked, report: null };
  const catalogue = getatextCatalogueUrl(url.toString());
  if (catalogue) url = new URL(catalogue);
  if (/(^|\.)getatext\.com$/i.test(url.hostname) && looksLikePurchase(input.url)) {
    return { error: "That address rents a number. Catalogue import will not call it.", report: null };
  }
  const key = input.apiKey?.trim() || (input.providerId ? await readProviderKey(input.providerId) : "");
  const probe = await probeProviderCatalogue({ url: url.toString(), apiKey: key, providerId: input.providerId, draft: input.setup, timeoutMs: 20000 });
  const name = doc.providers.find((item) => item.id === input.providerId)?.name || "";
  return { error: probe.ok ? null : probe.error, report: reportOf(probe, publicEndpoint(url.toString()), name) };
}

type ImportMeta = {
  name: string;
  baseUrl: string;
  currency: "NGN" | "USD";
  usdRate: number;
  markup: number;
  publish: boolean;
  hasKey: boolean;
  apiKey: string;
  kind: ImportKind;
  keepOthers?: boolean;
  categories?: string[];
  fetchSetup?: CatalogSetup;
  fetchStatus?: number;
  fetchDiscovered?: number;
  services?: string[];
};


function emptyImport(error: string | null) {
  return { error, jobId: "", total: 0, saved: 0, batch: 0, batches: 0, batchSize: IMPORT_BATCH, done: false, report: null as SyncReport | null, state: null as Data | null };
}

const KIND_EMPTY: Record<string, string> = {
  numbers: "No virtual numbers were in that catalogue.",
  server2: "No virtual numbers were in that catalogue.",
  server3: "No virtual numbers were in that catalogue.",
  usa: "GetaText did not return any USA services.",
  "vtu-airtime": "Airtime is not a catalogue. Nothing was saved.",
  "vtu-data": "No data plans were in that catalogue.",
  vtu: "Choose Airtime import or Data import.",
  vpn: "VPN is coming soon.",
  smm: "No SMM services were in that catalogue.",
  random: "That catalogue had no services.",
};

function importKindOf(value: string | undefined): ImportKind {
  return sourceKindOf(value) || "numbers";
}

async function rememberDiscoveredServices(discovered: string[]) {
  if (!discovered.length) return;
  await locked(async () => {
    const loaded = await loadLight();
    const wantedServices = mergeServiceNames(loaded.settings.wantedServices || [], discovered);
    const previous = loaded.settings.wantedServices || [];
    if (wantedServices.length === previous.length && wantedServices.every((name, index) => name === previous[index])) return;
    await writeState({ ...loaded, products: [], settings: { ...loaded.settings, wantedServices } });
  });
}

export async function beginCatalogImport(input: { url?: string; payload?: unknown; apiKey?: string; providerId?: string; name?: string; baseUrl?: string; currency?: string; usdRate?: number; markup?: number; publish?: boolean; kind?: string; selective?: boolean; setup?: CatalogSetup | null }) {
  const session = await readSession();
  const doc = await loadLight();
  const me = doc.users.find((u) => u.id === session.userId);
  if (me?.role !== "admin") return emptyImport("Only an admin can pull an API.");
  const selective = !!input.selective;
  const kind = importKindOf(input.kind);
  if (kind === "vpn") return emptyImport("VPN is coming soon. No products were imported.");
  if (kind === "vtu") return emptyImport("Choose Data import. Airtime is configured under Airtime networks, not imported.");
  const blocked = airtimeImportBlock(kind, input.url || "");
  if (blocked) return emptyImport(blocked);
  const wantedForPull: string[] = [];
  const routed = input.url ? fiveSimCategoryUrl(input.url) : { url: "", product: "" };
  let payload = input.payload;
  let reportedCurrency: "NGN" | "USD" | "" = "";
  let fetchSetup: CatalogSetup | undefined;
  let fetchStatus = 0;
  let fetchDiscovered = 0;
  let noted = "";
  let services: string[] = [];
  if (!selective && input.url) {
    const fetched = await pullRemote({ url: input.url, apiKey: input.apiKey, providerId: input.providerId, allow: kind === "numbers" ? wantedForPull : [], kind, setup: input.setup });
    if (!fetched.ok) return emptyImport(fetched.error);
    payload = fetched.payload;
    if ("currency" in fetched && (fetched.currency === "NGN" || fetched.currency === "USD")) reportedCurrency = fetched.currency;
    if ("services" in fetched && Array.isArray(fetched.services)) services = fetched.services.filter((name) => typeof name === "string" && name);
    if ("setup" in fetched && fetched.setup?.confirmed) {
      fetchSetup = fetched.setup;
      fetchStatus = "fetch" in fetched && fetched.fetch ? fetched.fetch.status : 200;
      fetchDiscovered = "fetch" in fetched && fetched.fetch ? fetched.fetch.discovered : 0;
      noted = "fetch" in fetched && fetched.fetch ? fetchNote(fetched.fetch) : "";
    }
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
  let source = extracted.items;
  if (kind === "vtu-data") {
    const attached = attachVtuIds(payload, extracted.items);
    if (attached !== extracted.items) source = attached;
  }
  const shapedBase = kind === "vtu-airtime"
    ? []
    : shapeImport(source, instakingBundle ? "smm" : kind, !selective && numberLike ? wantedForPull : []);
  const shaped = kind === "vtu-data" ? withoutAirtimeProducts(shapedBase) : shapedBase;
  const items = (selective ? shaped.slice(0, 200) : shaped) as ParsedItem[];
  if (!items.length) {
    if (services.length) await rememberDiscoveredServices(services);
    return emptyImport(selective ? "None of the ticked products could be read." : KIND_EMPTY[kind]);
  }
  const jobId = crypto.randomUUID();
  const touched = [...new Set(items.map((item) => `${item.country}|${item.service}`))];
  const categories = [...new Set(items.map((item) => item.category))];
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
    keepOthers: selective,
    categories,
    fetchSetup,
    fetchStatus,
    fetchDiscovered,
    services: services.length ? services : [...new Set(items.map((item) => item.service).filter(Boolean))],
  };
  const sql = await getSql();
  const skipped = extracted.skipped + (extracted.items.length - items.length);
  await sql`insert into shop_import_jobs (id, status, total, cursor, batch_size, created_count, updated_count, skipped, by_category, by_network, provider_id, keep_ids, touched, meta, error) values (${jobId}, 'running', ${items.length}, 0, ${IMPORT_BATCH}, 0, 0, ${skipped}, '{}', '{}', ${input.providerId || ""}, ${selective ? JSON.stringify(items.map((item) => item.externalId)) : "[]"}, ${JSON.stringify(touched)}, ${JSON.stringify(meta)}, '')`;
  const batches = sliceImport(items);
  for (let seq = 0; seq < batches.length; seq += 1) {
    await sql`insert into shop_import_batches (job_id, seq, items) values (${jobId}, ${seq}, ${JSON.stringify(batches[seq])})`;
  }
  return { error: null, jobId, total: items.length, saved: 0, batch: 0, batches: batches.length, batchSize: IMPORT_BATCH, done: false, report: null, state: null, fetchNote: noted };
}

function withProvider(doc: Data, meta: ImportMeta, providerId: string): { doc: Data; provider: import("@/lib/catalog").Provider } | { error: string } {
  const now = new Date().toISOString();
  const providers = doc.providers.map((provider) => ({ ...provider }));
  let provider = providerId ? providers.find((item) => item.id === providerId) : undefined;
  const five = /5sim\.net/i.test(meta.baseUrl);
  const dest = destinationOf(meta.kind);
  const slot = dest?.serverId === "1" || dest?.serverId === "2" || dest?.serverId === "3" ? dest.serverId : "";
  if (providerId && !providers.find((item) => item.id === providerId) && !slot) {
    return { error: "That provider was not found. Nothing was imported." };
  }
  if (slot) {
    const resolved = resolveNumberServer(providers, slot, providerId);
    if ("error" in resolved && resolved.error) return { error: resolved.error };
    if (resolved.create) {
      provider = {
        id: uid("prov"),
        name: meta.name || `Server ${slot}`,
        baseUrl: meta.baseUrl,
        hasKey: meta.hasKey,
        servesNumbers: true,
        enabled: true,
        currency: meta.currency,
        usdRate: meta.usdRate > 0 ? meta.usdRate : five ? 2646 : doc.settings.usdNgn,
        markup: 1,
        markupPercent: meta.markup > 0 ? meta.markup : 0,
        importType: "NUMBER_IMPORT",
        serverId: slot,
        operatorMarkups: {},
        operatorPrices: {},
        createdAt: now,
        lastSync: null,
      };
      providers.push(provider);
    } else {
      provider = providers.find((item) => item.id === resolved.providerId);
      if (!provider) return { error: `Server ${slot} was not found. Nothing was imported.` };
      provider.name = meta.name || provider.name;
      provider.baseUrl = meta.baseUrl || provider.baseUrl;
      provider.currency = meta.currency;
      if (meta.usdRate > 0) provider.usdRate = meta.usdRate;
      if (meta.markup > 0) provider.markupPercent = meta.markup;
      if (!provider.usdRate) provider.usdRate = five ? 2646 : doc.settings.usdNgn;
      provider.importType = "NUMBER_IMPORT";
      provider.serverId = slot;
      provider.servesNumbers = true;
      provider.enabled = true;
      if (meta.hasKey) provider.hasKey = true;
    }
    return { doc: { ...doc, providers }, provider };
  }
  if (provider && (provider.serverId === "1" || provider.serverId === "2" || provider.serverId === "3" || provider.importType === "NUMBER_IMPORT")) {
    return { error: "That provider is a number server. This import was not applied to it." };
  }
  if (!provider) {
    provider = {
      id: uid("prov"),
      name: meta.name,
      baseUrl: meta.baseUrl,
      hasKey: meta.hasKey,
      servesNumbers: false,
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
      provider.servesNumbers = false;
    }
    provider.enabled = true;
    if (meta.hasKey) provider.hasKey = true;
  }
  return { doc: { ...doc, providers }, provider };
}

export async function stepCatalogImport(jobId: string) {
  if (!jobId) return emptyImport("Missing import.");
  const session = await readSession();
  const light = await loadLight();
  const me = light.users.find((user) => user.id === session.userId);
  if (me?.role !== "admin") return emptyImport("Only an admin can pull an API.");
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    status: string;
    total: number;
    cursor: number;
    batch_size: number;
    created_count: number;
    updated_count: number;
    skipped: number;
    by_category: string;
    by_network: string;
    provider_id: string;
    touched: string;
    meta: string;
  }>`select id, status, total, cursor, batch_size, created_count, updated_count, skipped, by_category, by_network, provider_id, touched, meta from shop_import_jobs where id = ${jobId}`;
  const job = rows[0];
  if (!job) return emptyImport("That import is no longer on the server. Start it again.");
  const total = Number(job.total) || 0;
  const cursor = Number(job.cursor) || 0;
  const batchSize = Number(job.batch_size) || IMPORT_BATCH;
  const batches = importBatchCount(total, batchSize);
  if (job.status === "done" || cursor >= batches) {
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
    const held = await locked(async () => {
      const loaded = await loadLight();
      const next = withProvider(loaded, meta, job.provider_id || "");
      if ("error" in next) return next;
      await writeState({ ...next.doc, products: [] });
      return next;
    });
    if ("error" in held) {
      await sql`update shop_import_jobs set status = 'failed', error = ${held.error.slice(0, 300)} where id = ${jobId}`;
      return emptyImport(held.error);
    }
    const providerId = held.provider.id;
    await sql`update shop_import_jobs set provider_id = ${providerId} where id = ${jobId}`;
    if (meta.fetchSetup?.confirmed) {
      await saveProviderFetch(providerId, {
        ok: true,
        error: "",
        method: meta.fetchSetup.method || "GET",
        auth: meta.fetchSetup.auth,
        status: meta.fetchStatus || 200,
        payload: null,
        attempts: [],
        setup: meta.fetchSetup,
        discovered: meta.fetchDiscovered || 0,
        skipped: 0,
        failed: 0,
        shape: "",
        pages: false,
        note: "",
      });
    }
    const existing = await countExistingProducts(providerId, items.map((item) => item.externalId));
    const products: Product[] = items.map((item) => ({
      id: uid("prd"),
      providerId,
      externalId: item.externalId,
      category: item.category,
      name: item.name,
      service: item.service,
      country: item.country,
      network: item.network,
      price: customerPrice({
        cost: item.price,
        currency: held.provider.currency,
        usdRate: held.provider.usdRate || held.doc.settings.usdNgn,
        category: item.category,
        profits: profitsOf({ general: held.doc.settings.generalProfit, airtime: held.doc.settings.airtimeProfit, data: held.doc.settings.dataProfit }),
      }).price,
      cost: item.price,
      stock: item.stock,
      operator: item.operator || "",
      rate: item.rate || 0,
      rates: item.rates || "",
      enabled: meta.publish,
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
      imageUrl: item.imageUrl || "",
    }));
    await upsertProductRows(products, jobId);
    const ids = [...new Set(items.map((item) => item.externalId).filter(Boolean))];
    tally.created += Math.max(0, items.length - existing);
    tally.updated += existing;
    for (const item of items) {
      tally.byCategory[item.category] = (tally.byCategory[item.category] || 0) + 1;
      if (item.network) tally.byNetwork[item.network] = (tally.byNetwork[item.network] || 0) + 1;
    }
    if (meta.apiKey) {
      await rememberKey(providerId, meta.apiKey);
      meta.apiKey = "";
    }
    if (finalize && !meta.keepOthers) {
      const touched = JSON.parse(job.touched || "[]") as string[];
      await pruneSyncedProducts(providerId, jobId, touched, meta.categories || [...new Set(items.map((item) => item.category))]);
    }
    const written = ids.length ? await countExistingProducts(providerId, ids) : 0;
    if (ids.length && written < ids.length) {
      throw new Error(`Saved ${written.toLocaleString("en-NG")} of ${ids.length.toLocaleString("en-NG")} products. Nothing was marked complete.`);
    }
    await locked(async () => {
      const loaded = await loadLight();
      const wantedServices = mergeServiceNames(loaded.settings.wantedServices || [], meta.services || []);
      const providers = loaded.providers.map((provider) => {
        if (provider.id !== providerId) return provider;
        return {
          ...provider,
          servesNumbers: provider.servesNumbers || items.some((item) => item.category === "number" || item.category === "numbers" || item.category === "rent"),
          enabled: true,
          lastSync: {
            at: new Date().toISOString(),
            imported: finalize ? total : Math.min(total, (cursor + 1) * batchSize),
            created: tally.created,
            updated: tally.updated,
            skipped: Number(job.skipped) || 0,
            byCategory: tally.byCategory,
            byNetwork: tally.byNetwork,
          },
        };
      });
      await writeState({ ...loaded, providers, products: [], settings: { ...loaded.settings, wantedServices } });
    });
    const saved = finalize ? total : Math.min(total, (cursor + 1) * batchSize);
    await sql`update shop_import_jobs set status = ${finalize ? "done" : "running"}, cursor = ${cursor + 1}, created_count = ${tally.created}, updated_count = ${tally.updated}, by_category = ${JSON.stringify(tally.byCategory)}, by_network = ${JSON.stringify(tally.byNetwork)}, provider_id = ${providerId}, meta = ${JSON.stringify(meta)}, error = '' where id = ${jobId}`;
    await sql`delete from shop_import_batches where job_id = ${jobId} and seq = ${cursor}`;
    const fresh = await readSession();
    const view = await loadLight();
    const report: SyncReport = {
      imported: finalize ? total : items.length,
      created: tally.created,
      updated: tally.updated,
      skipped: Number(job.skipped) || 0,
      byCategory: tally.byCategory,
      byNetwork: tally.byNetwork,
      providerId,
      serverLabel: serverLabel(view.providers, providerId),
    };
    return { error: null, jobId, total, saved, batch: cursor + 1, batches, batchSize, done: finalize, report, state: projectShop(view, fresh.userId, fresh.draft) };
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
  const serverId = want === "number" && !input.providerId ? input.serverId || "" : "";
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
    const rank = (rows: { service: string; providerId: string; cost: number; price: number }[]) => {
      const best = new Map<string, number>();
      for (const row of rows) {
        const price = quoteProduct(
          { id: "", providerId: row.providerId, externalId: "", category: want, name: row.service, service: row.service, country: input.country || "", network: "", price: row.price, cost: row.cost, stock: 0, operator: "", rate: -1, rates: "", enabled: true, validity: "", variable: false, description: "" },
          doc,
        ).price;
        const prev = best.get(row.service);
        if (price > 0 && (prev == null || price < prev)) best.set(row.service, price);
      }
      return [...best.entries()].map(([service, price]) => ({ service, price })).sort((a, b) => a.service.localeCompare(b.service));
    };
    const ranked = rank(await queryServices(query));
    const limit = want === "usa" ? 400 : 100;
    const provider = doc.providers.find((item) => item.id === (input.providerId || ""));
    const fiveSim = want === "number" && isFiveSimServer1(provider);
    const preview = ranked.slice(0, limit);
    const offer = fiveSim && wantsWhatsAppLookup(query.q) && !preview.some((row) => isWhatsAppService(row.service))
      ? preferWhatsApp(rank(await queryWhatsAppOffer(query)))
      : null;
    return finishServicePage(ranked, limit, { fiveSim, q: query.q, offer });
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

export async function browseExtras(input: { q?: string; kind?: string; page?: number; subcategory?: string; after?: string }) {
  const doc = await loadLight();
  const session = await readSession();
  if (!session.userId) return { rows: [] as Product[], more: false, next: "" };
  const providerIds = doc.providers.filter((provider) => provider.enabled).map((provider) => provider.id);
  const kind = input.kind === "vpn" || input.kind === "smm" ? input.kind : "random";
  const page = await queryExtras({ q: (input.q || "").trim(), providerIds, kind, page: input.page, subcategory: (input.subcategory || "").trim(), after: input.after || "" });
  const { logoMap } = await import("@/lib/logo-rows.server");
  const logos = await logoMap();
  return { rows: page.rows.map((row) => applyCategoryLogo(quoteProduct(row, doc), logos)), more: page.more, next: page.next };
}

export async function browseCatalog(input: { q?: string; category?: string; providerId?: string; only?: string; page?: number; subcategory?: string; after?: string }) {
  const doc = await loadLight();
  const session = await readSession();
  const me = doc.users.find((u) => u.id === session.userId);
  if (me?.role !== "admin") return { rows: [] as Product[], total: 0, live: 0, next: "" };
  return queryCatalogPage({
    q: (input.q || "").trim(),
    category: input.category || "",
    providerId: input.providerId || "",
    only: input.only || "",
    page: Number(input.page) || 0,
    subcategory: input.subcategory || "",
    after: input.after || "",
  });
}

const SHELF_OK = new Set(["data"]);

export async function listShelf(category: string, q = "", network = "") {
  const doc = await loadLight();
  const session = await readSession();
  if (!session.userId || !SHELF_OK.has(category)) return [];
  const providerIds = doc.providers.filter((provider) => provider.enabled).map((provider) => provider.id);
  const rows = await queryShelf(category, providerIds, q, 2000, network);
  return rows.map((row) => quoteProduct(row, doc));
}

export async function adminCatalogStats() {
  const doc = await loadLight();
  const session = await readSession();
  const me = doc.users.find((user) => user.id === session.userId);
  if (me?.role !== "admin") return { total: 0, live: 0, byCategory: {} as Record<string, number>, byProvider: {} as Record<string, { count: number; live: number }> };
  return catalogCounts();
}

export async function pricingSample() {
  const doc = await loadLight();
  const session = await readSession();
  const me = doc.users.find((user) => user.id === session.userId);
  if (me?.role !== "admin") return [];
  return sampleProducts(12);
}

export async function openImportJobs() {
  const doc = await loadLight();
  const session = await readSession();
  const me = doc.users.find((user) => user.id === session.userId);
  if (me?.role !== "admin") return [];
  const sql = await getSql();
  const rows = await sql<{ id: string; status: string; total: number; cursor: number; batch_size: number; error: string; provider_id: string }>`select id, status, total, cursor, batch_size, error, provider_id from shop_import_jobs where status in ('running', 'failed') order by created_at desc limit 5`;
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    total: Number(row.total) || 0,
    cursor: Number(row.cursor) || 0,
    batchSize: Number(row.batch_size) || 2000,
    error: row.error || "",
    providerId: row.provider_id || "",
  }));
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
  for (const order of orders) {
    const prev = doc.orders.find((item) => item.id === order.id);
    if (prev && prev.status !== "completed" && order.status === "completed") {
      await settleReferral({ buyerId: order.userId, orderId: order.id, amount: order.amount, profit: order.amount - (order.cost || 0), orderStatus: "completed" });
    }
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

export async function askSupport(question: string, threadId = "") {
  const q = question.trim().slice(0, 500);
  if (!q) return { text: "Type a question first.", threadId: "", escalated: false, unanswered: false };
  const doc = await loadLight();
  const session = await readSession();
  const me = doc.users.find((user) => user.id === session.userId) || null;
  const facts = await supportFacts(doc, me, q);
  const { answerVera } = await import("@/lib/vera.server");
  return answerVera({
    question: q,
    threadId: threadId.slice(0, 80),
    user: me ? { id: me.id } : null,
    facts,
    faqs: doc.faqs,
    telegram: doc.settings.telegram,
    welcome: doc.settings.supportWelcome,
  });
}

async function supportFacts(doc: Data, user: Data["users"][number] | null, question: string) {
  const lines = ["Server 1 is FiveSim. Server 2 and Server 3 are different providers. Do not mix their stock or prices."];
  if (!user) lines.push("Customer is not signed in. Do not guess a balance, order or deposit.");
  else {
    lines.push(`Signed-in balance: ₦${user.balance}. Use this figure only.`);
    const orders = doc.orders.filter((order) => order.userId === user.id).slice(0, 5);
    lines.push(orders.length ? `Recent orders: ${orders.map((order) => `${order.title} (${order.status}, ₦${order.amount})`).join("; ")}` : "This account has no orders.");
    const credits = doc.txns.filter((txn) => txn.userId === user.id && txn.kind === "topup").slice(0, 3);
    lines.push(credits.length ? `Recent wallet credits: ${credits.map((txn) => `${txn.note} ₦${txn.amount}`).join("; ")}` : "No wallet credit is recorded on this account yet.");
  }
  const service = mentionedService(question);
  const country = mentionedCountry(question);
  if (service) {
    const provider = doc.providers.find((item) => item.enabled && isFiveSimServer1(item));
    if (!provider) lines.push("FiveSim Server 1 is not enabled in this shop.");
    else if (!country) lines.push(`The customer asked about ${service} on FiveSim Server 1 but named no country. Ask which country. Do not claim one is available.`);
    else {
      const rows = await queryStockedService({ providerId: provider.id, category: "number", country, admin: false, enabledProviderIds: [provider.id] }, service);
      const row = rows[0];
      if (!row) lines.push(`No stocked ${service} row for ${country} on FiveSim Server 1.`);
      else {
        const price = quoteProduct(
          { id: "", providerId: row.providerId, externalId: "", category: "number", name: row.service, service: row.service, country, network: "", price: row.price, cost: row.cost, stock: 1, operator: "", rate: -1, rates: "", enabled: true, validity: "", variable: false, description: "" },
          doc,
        ).price;
        lines.push(price > 0 ? `${row.service} is stocked on FiveSim Server 1 for ${country}. Listed from ₦${price}.` : `${row.service} is stocked on FiveSim Server 1 for ${country}.`);
      }
    }
  }
  return lines.join("\n");
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

export async function listPublicAirtime() {
  const session = await readSession();
  const doc = await loadLight();
  const user = doc.users.find((item) => item.id === session.userId);
  if (!user) return { error: "Sign in first.", offers: [] as ReturnType<typeof airtimeOffers> };
  const records = await listAirtimeRecords();
  return { error: null as string | null, offers: airtimeOffers(records.networks, records.routes, doc.providers, doc.settings.airtimeProfit) };
}

export async function listAdminAirtime() {
  const admin = await adminContext();
  if (!admin) return { error: "Only an admin can manage airtime.", networks: [], routes: [] as AirtimeRouteRecord[] };
  const records = await listAirtimeRecords();
  return { error: null as string | null, networks: records.networks, routes: records.routes };
}

export async function saveAdminAirtimeNetwork(input: { id?: string; name: string; imageUrl?: string; enabled: boolean; minAmount: number; maxAmount: number; profitNaira: number | null }) {
  const admin = await adminContext();
  if (!admin) return { error: "Only an admin can manage airtime." };
  return saveAirtimeNetworkRow(input);
}

export async function saveAdminAirtimeRoute(input: AirtimeRouteRecord) {
  const admin = await adminContext();
  if (!admin) return { error: "Only an admin can manage airtime." };
  const provider = admin.doc.providers.find((item) => item.id === input.providerId);
  if (!provider) return { error: "Choose a provider that already exists." };
  return saveAirtimeRouteRow(input);
}

export async function removeAdminAirtimeRoute(id: string) {
  const admin = await adminContext();
  if (!admin) return { error: "Only an admin can manage airtime." };
  return deleteAirtimeRouteRow(id);
}

export async function removeAdminAirtimeNetwork(id: string) {
  const admin = await adminContext();
  if (!admin) return { error: "Only an admin can manage airtime." };
  return deleteAirtimeNetworkRow(id);
}

export async function adminContext() {
  const session = await readSession();
  const doc = await loadLight();
  const me = doc.users.find((user) => user.id === session.userId);
  if (me?.role !== "admin") return null;
  return { doc, userId: me.id };
}

export async function sessionCustomer() {
  const session = await readSession();
  const doc = await loadLight();
  return doc.users.find((user) => user.id === session.userId) || null;
}

export async function businessProfit() {
  const admin = await adminContext();
  if (!admin) return { error: "Only an admin can see profit.", report: null };
  return { error: null as string | null, report: summarizeProfit(admin.doc.orders) };
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
