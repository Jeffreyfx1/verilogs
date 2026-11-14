import { deleteCookie, getCookie, getRequestUrl, setCookie } from "@tanstack/react-start/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";
import { freshData, isLive, normalizeData, repairCatalog, topupQuote, withAdminLogin, applyImportSlice, type Data, type Product, type SyncReport } from "@/lib/catalog";
import { extractCatalog, slimFiveSim, type ParsedItem } from "@/lib/categorize";
import { IMPORT_BATCH, importBatchCount, sliceImport } from "@/lib/import-batch";
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
  setEnabled,
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

function cookieOpts() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 30,
    secure: (process.env.APP_URL || "").startsWith("https://"),
  };
}

function touchCookie(token: string) {
  setCookie(COOKIE, token, cookieOpts());
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

async function loadDoc(withCatalog = false): Promise<Data> {
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
  return product.category === "numbers" || product.category === "rent";
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

export async function currentShop(): Promise<ApplyResult> {
  const doc = await loadLight();
  const session = await readSession();
  return result(doc, session.userId, session.draft, null);
}

export async function applyAct(op: string, payload: Record<string, unknown>): Promise<ApplyResult> {
  if (LIGHT.has(op)) return runAct(op, payload);
  return locked(() => runAct(op, payload));
}

async function runAct(op: string, payload: Record<string, unknown>): Promise<ApplyResult> {
    const catalog = !LIGHT.has(op) && (op === "buy" || op === "import" || op === "setEnabled" || op === "setProvider" || op === "reset");
    let doc = LIGHT.has(op) ? await loadLight() : await loadDoc(catalog);
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
        touchCookie(token);
      }
    } else if (op === "login") {
      const out = await loginUser(doc, str("email"), str("password"));
      error = out.error;
      if (!error && out.userId) {
        userId = out.userId;
        draft = null;
        await writeSession(token, userId, null);
        touchCookie(token);
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
      const out = buyProduct(doc, userId, str("productId"), { phone: str("phone"), amount: num("amount"), detail: str("detail") });
      doc = out.data;
      error = out.error;
    } else if (op === "refund") {
      const out = refundOrder(doc, userId, str("orderId"));
      doc = out.data;
      error = out.error;
    } else if (op === "tick") {
      doc = tickWaiting(doc);
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
    } else if (op === "setProvider") {
      const patch: { enabled?: boolean; name?: string; usdRate?: number; markup?: number; currency?: "NGN" | "USD" } = {};
      if (typeof payload.enabled === "boolean") patch.enabled = payload.enabled;
      if (str("name")) patch.name = str("name");
      if (Number.isFinite(num("usdRate")) && num("usdRate") > 0) patch.usdRate = num("usdRate");
      if (Number.isFinite(num("markup")) && num("markup") > 0) patch.markup = num("markup");
      if (payload.currency === "USD" || payload.currency === "NGN") patch.currency = payload.currency;
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
      else doc = resetShop();
    } else {
      error = "Unknown action.";
    }

    if (!error) await saveDoc(doc, catalog);
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
  return { needsPhone: out.needsPhone, role: out.userId ? doc.users.find((u) => u.id === out.userId)?.role : "customer" };
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
  const body = (await res.json()) as { status?: boolean; data?: { status?: string; amount?: number; metadata?: { userId?: string; credit?: number } } };
  if (!body.status || body.data?.status !== "success") return { error: "Paystack has not confirmed this payment." };
  const userId = body.data.metadata?.userId;
  if (!userId) return { error: "Payment is missing the account it belongs to." };
  if (expect && expect !== userId) return { error: "This payment belongs to another account." };
  const charged = Math.round(Number(body.data.amount || 0) / 100);
  const credit = Math.round(Number(body.data.metadata?.credit || charged));
  const amount = credit > 0 && credit <= charged ? credit : charged;
  return locked(async () => {
    const doc = await loadDoc();
    const out = creditVerified(doc, userId, amount, reference);
    if (out.error) return { error: out.error };
    await saveDoc(out.data);
    await sendMail(out.mail);
    const session = await readSession();
    return { error: null, state: projectShop(out.data, session.userId, session.draft) };
  });
}

export async function creditFromWebhook(raw: string, signature: string | null) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const digest = createHmac("sha512", secret).update(raw).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const event = JSON.parse(raw) as { event?: string; data?: { reference?: string; status?: string; amount?: number; metadata?: { userId?: string; credit?: number } } };
  if (event.event !== "charge.success" || event.data?.status !== "success" || !event.data.reference || !event.data.metadata?.userId) return true;
  const charged = Math.round(Number(event.data.amount || 0) / 100);
  const credit = Math.round(Number(event.data.metadata.credit || charged));
  const amount = credit > 0 && credit <= charged ? credit : charged;
  await locked(async () => {
    const doc = await loadDoc();
    const out = creditVerified(doc, event.data!.metadata!.userId!, amount, event.data!.reference!);
    if (!out.error) {
      await saveDoc(out.data);
      await sendMail(out.mail);
    }
  });
  return true;
}

export async function startPaystack(amount: number) {
  const n = Math.round(amount);
  if (n < 100 || n > 500000) return { error: "Amount must be between ₦100 and ₦500,000." };
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { error: "Paystack is not connected yet. Add the secret key on Render, then try again." };
  const session = await readSession();
  if (!session.userId) return { error: "Sign in first." };
  const doc = await loadDoc();
  const user = doc.users.find((u) => u.id === session.userId);
  if (!user) return { error: "Sign in first." };
  const quote = topupQuote(n, doc.settings);
  if (quote.pay > 2000000) return { error: "That top up plus the site charge is too large." };
  const reference = "vl_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const origin = (process.env.APP_URL || getRequestUrl().origin).replace(/\/$/, "");
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      amount: quote.pay * 100,
      reference,
      currency: "NGN",
      callback_url: origin + "/dashboard/wallet",
      metadata: { userId: user.id, credit: quote.credit },
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

export async function pullRemote(input: { url: string; apiKey?: string; providerId?: string }) {
  const session = await readSession();
  const doc = await loadDoc();
  const me = doc.users.find((u) => u.id === session.userId);
  if (me?.role !== "admin") return { ok: false as const, error: "Only an admin can pull an API." };
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return { ok: false as const, error: "Enter a full https address." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false as const, error: "Only http and https catalogues can be pulled." };
  const key = input.apiKey?.trim() || (input.providerId ? await readProviderKey(input.providerId) : "");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (key) {
    headers.Authorization = "Bearer " + key;
    headers["X-API-KEY"] = key;
    headers["api-key"] = key;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const text = await res.text();
    if (text.length > 16_000_000) return { ok: false as const, error: "That catalogue is larger than 16MB." };
    if (!res.ok) return { ok: false as const, error: `The API replied ${res.status}.` };
    const parsed = JSON.parse(text) as unknown;
    const hint = /hosting|rent/i.test(url.search + url.pathname) ? "hosting" : "";
    const payload = url.hostname.endsWith("5sim.net") ? slimFiveSim(parsed, hint) : parsed;
    return { ok: true as const, payload };
  } catch {
    return { ok: false as const, error: "Could not reach that API. Check the URL and key." };
  } finally {
    clearTimeout(timer);
  }
}

type ImportMeta = { name: string; baseUrl: string; currency: "NGN" | "USD"; usdRate: number; markup: number; publish: boolean; hasKey: boolean; apiKey: string };

function emptyImport(error: string | null) {
  return { error, jobId: "", total: 0, saved: 0, batch: 0, batches: 0, batchSize: IMPORT_BATCH, done: false, report: null as SyncReport | null, state: null as Data | null };
}

export async function beginCatalogImport(input: { url?: string; payload?: unknown; apiKey?: string; providerId?: string; name?: string; baseUrl?: string; currency?: string; usdRate?: number; markup?: number; publish?: boolean }) {
  const session = await readSession();
  const doc = await loadLight();
  const me = doc.users.find((u) => u.id === session.userId);
  if (me?.role !== "admin") return emptyImport("Only an admin can pull an API.");
  let payload = input.payload;
  if (input.url) {
    const fetched = await pullRemote({ url: input.url, apiKey: input.apiKey, providerId: input.providerId });
    if (!fetched.ok) return emptyImport(fetched.error);
    payload = fetched.payload;
  }
  if (payload == null) return emptyImport("Add a catalogue URL or paste JSON.");
  const extracted = extractCatalog(payload);
  if (!extracted.items.length) return emptyImport("That catalogue had no services to import.");
  const chunks = sliceImport(extracted.items);
  const jobId = crypto.randomUUID();
  const meta: ImportMeta = {
    name: input.name || "New API",
    baseUrl: input.baseUrl || input.url || "https://provider.example/api",
    currency: input.currency === "USD" ? "USD" : "NGN",
    usdRate: Number(input.usdRate) || 0,
    markup: Number(input.markup) || 0,
    publish: !!input.publish,
    hasKey: !!input.apiKey || !!input.url,
    apiKey: input.apiKey || "",
  };
  const touched = [...new Set(extracted.items.map((item) => `${item.country}|${item.service}`))];
  const sql = await getSql();
  await sql`insert into shop_import_jobs (id, status, total, cursor, batch_size, skipped, provider_id, keep_ids, touched, meta) values (${jobId}, 'ready', ${extracted.items.length}, 0, ${IMPORT_BATCH}, ${extracted.skipped}, ${input.providerId || ""}, ${JSON.stringify(extracted.items.map((item) => item.externalId))}, ${JSON.stringify(touched)}, ${JSON.stringify(meta)})`;
  for (let seq = 0; seq < chunks.length; seq++) {
    await sql`insert into shop_import_batches (job_id, seq, items) values (${jobId}, ${seq}, ${JSON.stringify(chunks[seq])})`;
  }
  if (input.apiKey && input.providerId) await rememberKey(input.providerId, input.apiKey);
  return { error: null, jobId, total: extracted.items.length, saved: 0, batch: 0, batches: chunks.length, batchSize: IMPORT_BATCH, done: false, report: null, state: null };
}

export async function stepCatalogImport(jobId: string) {
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
      const doc = await loadDoc();
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

export async function browseNumbers(input: { providerId?: string; category?: string; country?: string; service?: string; q?: string; detail?: boolean }) {
  const doc = await loadDoc(true);
  const session = await readSession();
  const me = doc.users.find((u) => u.id === session.userId);
  const admin = me?.role === "admin";
  const want = input.category === "rent" ? "rent" : "numbers";
  let rows = doc.products.filter((p) => (!input.providerId || p.providerId === input.providerId) && p.category === want && p.country && p.country !== "Any");
  if (!admin) rows = rows.filter((p) => isLive(p, doc.providers));
  if (input.country) rows = rows.filter((p) => p.country === input.country);
  const hidden = admin ? doc.products.filter((p) => (!input.providerId || p.providerId === input.providerId) && p.category === want && !p.enabled).length : 0;
  const empty = { services: [] as { service: string; price: number }[], countries: [] as Product[], operators: [] as Product[], hidden };
  if (input.detail && input.service && input.country) {
    const operators = rows
      .filter((product) => product.service === input.service)
      .sort((a, b) => (b.rate || 0) - (a.rate || 0) || a.price - b.price || (a.operator || "").localeCompare(b.operator || ""));
    return { ...empty, operators };
  }
  if (input.service) {
    const map = new Map<string, Product>();
    for (const product of rows) {
      if (product.service !== input.service) continue;
      const cur = map.get(product.country);
      if (!cur || (product.price > 0 && product.price < cur.price)) map.set(product.country, product);
    }
    return { ...empty, countries: [...map.values()].sort((a, b) => a.price - b.price || a.country.localeCompare(b.country)) };
  }
  const q = (input.q || "").trim().toLowerCase();
  const map = new Map<string, { service: string; price: number }>();
  for (const product of rows) {
    if (q && !product.service.toLowerCase().includes(q)) continue;
    const cur = map.get(product.service);
    if (!cur || product.price < cur.price) map.set(product.service, { service: product.service, price: product.price });
  }
  return { ...empty, services: [...map.values()].sort((a, b) => a.service.localeCompare(b.service)).slice(0, 100) };
}

export async function browseCatalog(input: { q?: string; category?: string; providerId?: string; only?: string; page?: number }) {
  const doc = await loadDoc(true);
  const session = await readSession();
  const me = doc.users.find((u) => u.id === session.userId);
  if (me?.role !== "admin") return { rows: [] as Product[], total: 0, live: 0 };
  const q = (input.q || "").trim().toLowerCase();
  const filtered = doc.products.filter((p) => {
    if (input.category && p.category !== input.category) return false;
    if (input.providerId && p.providerId !== input.providerId) return false;
    if (input.only === "on" && !p.enabled) return false;
    if (input.only === "off" && p.enabled) return false;
    if (q && !`${p.name} ${p.service} ${p.country} ${p.network}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const page = Math.max(0, Number(input.page) || 0);
  return {
    rows: filtered.slice(page * 40, page * 40 + 40),
    total: filtered.length,
    live: doc.products.filter((p) => p.enabled).length,
  };
}

export async function askSupport(question: string) {
  const q = question.trim().slice(0, 500);
  if (!q) return { text: "Type a question first." };
  const doc = await loadDoc();
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

export function googleConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleStartUrl(origin: string) {
  const id = process.env.GOOGLE_CLIENT_ID || "";
  const redirect = origin.replace(/\/$/, "") + "/api/google/callback";
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.searchParams.set("client_id", id);
  auth.searchParams.set("redirect_uri", redirect);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("scope", "openid email profile");
  auth.searchParams.set("prompt", "select_account");
  return auth.toString();
}

export async function googleExchange(code: string, origin: string) {
  const redirect = origin.replace(/\/$/, "") + "/api/google/callback";
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
    redirect_uri: redirect,
    grant_type: "authorization_code",
  });
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) return null;
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = (await profileRes.json()) as { email?: string; name?: string };
  if (!profile.email) return null;
  return connectGoogle({ email: profile.email, name: profile.name || profile.email });
}
