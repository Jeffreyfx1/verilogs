import { deleteCookie, getCookie, getRequestUrl, setCookie } from "@tanstack/react-start/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSql } from "@/lib/db";
import { freshData, normalizeData, withAdminLogin, type Data, type SyncReport } from "@/lib/catalog";
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

async function loadDoc(): Promise<Data> {
  const sql = await getSql();
  const rows = await sql<{ doc: string }>`select doc from shop_state where id = 'main'`;
  if (!rows[0]) {
    const doc = freshData();
    await sql`insert into shop_state (id, doc) values ('main', ${JSON.stringify(doc)})`;
    return doc;
  }
  try {
    const parsed = normalizeData(JSON.parse(rows[0].doc) as Data);
    const cleaned = withAdminLogin(withoutSampleCatalog(parsed));
    if (cleaned !== parsed) await saveDoc(cleaned);
    return cleaned;
  } catch {
    return freshData();
  }
}

async function saveDoc(doc: Data) {
  const sql = await getSql();
  const text = JSON.stringify(doc);
  const existing = await sql`select id from shop_state where id = 'main'`;
  if (existing[0]) await sql`update shop_state set doc = ${text}, updated_at = now() where id = 'main'`;
  else await sql`insert into shop_state (id, doc) values ('main', ${text})`;
}

export async function sendMail(mail: Mail | undefined) {
  if (!mail) return;
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const from = process.env.RESEND_FROM || "VeriLogs <notifications@veri-logs.com>";
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.text }),
    });
  } catch {
    /* in-app notice still stands */
  }
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

export async function currentShop(): Promise<ApplyResult> {
  return locked(async () => {
    const loaded = await loadDoc();
    const doc = tickWaiting(loaded);
    if (doc !== loaded) await saveDoc(doc);
    const session = await readSession();
    return result(doc, session.userId, session.draft, null);
  });
}

export async function applyAct(op: string, payload: Record<string, unknown>): Promise<ApplyResult> {
  return locked(async () => {
    let doc = await loadDoc();
    const session = await readSession();
    let userId = session.userId;
    let draft = session.draft;
    let error: string | null = null;
    let report: SyncReport | null = null;
    let mail: Mail | undefined;
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
      const patch: { enabled?: boolean; name?: string } = {};
      if (typeof payload.enabled === "boolean") patch.enabled = payload.enabled;
      if (str("name")) patch.name = str("name");
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

    if (!error) await saveDoc(doc);
    if (!error && mail) await sendMail(mail);
    return result(await loadDoc(), userId, draft, error, report);
  });
}

export async function connectGoogle(profile: { email: string; name: string }) {
  return locked(async () => {
    const doc = await loadDoc();
    const out = upsertGoogle(doc, profile);
    const token = crypto.randomUUID();
    await writeSession(token, out.userId, out.needsPhone ? out.draft : null);
    touchCookie(token);
    return { needsPhone: out.needsPhone, role: out.userId ? doc.users.find((u) => u.id === out.userId)?.role : "customer" };
  });
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
  const body = (await res.json()) as { status?: boolean; data?: { status?: string; amount?: number; metadata?: { userId?: string } } };
  if (!body.status || body.data?.status !== "success") return { error: "Paystack has not confirmed this payment." };
  const userId = body.data.metadata?.userId;
  if (!userId) return { error: "Payment is missing the account it belongs to." };
  if (expect && expect !== userId) return { error: "This payment belongs to another account." };
  const amount = Math.round(Number(body.data.amount || 0) / 100);
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
  const event = JSON.parse(raw) as { event?: string; data?: { reference?: string; status?: string; amount?: number; metadata?: { userId?: string } } };
  if (event.event !== "charge.success" || event.data?.status !== "success" || !event.data.reference || !event.data.metadata?.userId) return true;
  const amount = Math.round(Number(event.data.amount || 0) / 100);
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
  const reference = "vl_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const origin = (process.env.APP_URL || getRequestUrl().origin).replace(/\/$/, "");
  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      amount: n * 100,
      reference,
      currency: "NGN",
      callback_url: origin + "/dashboard/wallet",
      metadata: { userId: user.id },
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
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const text = await res.text();
    if (text.length > 4_000_000) return { ok: false as const, error: "That catalogue is larger than 4MB." };
    if (!res.ok) return { ok: false as const, error: `The API replied ${res.status}.` };
    const payload = JSON.parse(text) as unknown;
    return { ok: true as const, payload };
  } catch {
    return { ok: false as const, error: "Could not reach that API. Check the URL and key." };
  } finally {
    clearTimeout(timer);
  }
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
