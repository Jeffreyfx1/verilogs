import { getSql } from "@/lib/db";
import { mergeMessages, parseFiveSimCheck, parseGetatextStatus, parseGetatextWebhook, type SmsMessage } from "@/lib/fulfilment";
import { uid } from "@/lib/money";

export type FulfilmentRow = {
  order_id: string;
  user_id: string;
  category: string;
  title: string;
  provider_id: string;
  provider: string;
  provider_ref: string;
  phone: string;
  country: string;
  service: string;
  delivery: string;
  messages: string;
  status: string;
  updated_at: string;
};

export async function rememberFulfilment(input: {
  orderId: string;
  userId: string;
  category: string;
  title: string;
  providerId: string;
  provider: string;
  providerRef: string;
  phone: string;
  country: string;
  service: string;
  delivery: string;
  status: string;
}) {
  const sql = await getSql();
  const now = new Date().toISOString();
  await sql.query(
    `insert into shop_fulfilments (order_id, user_id, category, title, provider_id, provider, provider_ref, phone, country, service, delivery, messages, status, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'[]',$12,$13)
     on conflict (order_id) do update set
       provider_ref = case when excluded.provider_ref <> '' then excluded.provider_ref else shop_fulfilments.provider_ref end,
       phone = case when excluded.phone <> '' then excluded.phone else shop_fulfilments.phone end,
       delivery = case when excluded.delivery <> '' then excluded.delivery else shop_fulfilments.delivery end,
       status = excluded.status,
       updated_at = excluded.updated_at`,
    [
      input.orderId,
      input.userId,
      input.category,
      input.title.slice(0, 180),
      input.providerId,
      input.provider.slice(0, 120),
      input.providerRef.slice(0, 80),
      input.phone.slice(0, 40),
      input.country.slice(0, 80),
      input.service.slice(0, 80),
      input.delivery.slice(0, 8000),
      input.status.slice(0, 40),
      now,
    ],
  );
}

export async function readFulfilment(orderId: string) {
  const sql = await getSql();
  const rows = await sql.query<FulfilmentRow>("select * from shop_fulfilments where order_id = $1", [orderId]);
  return rows[0] || null;
}

export function messagesFrom(raw: string): SmsMessage[] {
  try {
    const parsed = JSON.parse(raw || "[]") as SmsMessage[];
    return Array.isArray(parsed) ? parsed.filter((item) => item && (item.text || item.code)) : [];
  } catch {
    return [];
  }
}

export async function saveFulfilmentMessages(orderId: string, messages: SmsMessage[], patch: { phone?: string; status?: string; providerStatus?: string }) {
  const sql = await getSql();
  await sql.query(
    "update shop_fulfilments set messages = $2, phone = case when $3 <> '' then $3 else phone end, status = case when $4 <> '' then $4 else status end, updated_at = $5 where order_id = $1",
    [orderId, JSON.stringify(messages).slice(0, 20000), patch.phone || "", patch.status || "", new Date().toISOString()],
  );
}

export async function pullProviderSms(input: { provider: string; apiKey: string; providerRef: string }): Promise<{ supported: boolean; error: string; phone: string; status: string; messages: SmsMessage[]; terminal: boolean }> {
  const host = input.provider.toLowerCase();
  const id = input.providerRef.replace(/[^\w.-]/g, "");
  if (!input.apiKey || !id) return { supported: false, error: "This order has no provider reference to check.", phone: "", status: "", messages: [], terminal: false };
  if (host.includes("5sim.net")) {
    let res: Response;
    try {
      res = await fetch(`https://5sim.net/v1/user/check/${encodeURIComponent(id)}`, {
        headers: { Authorization: "Bearer " + input.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      return { supported: true, error: "5sim could not be reached.", phone: "", status: "", messages: [], terminal: false };
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) return { supported: true, error: "5sim refused the SMS check.", phone: "", status: "", messages: [], terminal: false };
    const parsed = parseFiveSimCheck(json);
    return { supported: true, error: "", ...parsed };
  }
  if (host.includes("getatext.com")) {
    let res: Response;
    try {
      res = await fetch("https://getatext.com/api/v1/rental-status", {
        method: "POST",
        headers: { Auth: input.apiKey, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(id) || id }),
        signal: AbortSignal.timeout(12000),
      });
    } catch {
      return { supported: true, error: "GetaText could not be reached.", phone: "", status: "", messages: [], terminal: false };
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) return { supported: true, error: "GetaText refused the rental check.", phone: "", status: "", messages: [], terminal: false };
    const parsed = parseGetatextStatus(json);
    return { supported: true, error: "", ...parsed };
  }
  return { supported: false, error: "This provider has no documented SMS check in VeriLogs.", phone: "", status: "", messages: [], terminal: false };
}

export async function recordWebhook(input: { provider: string; eventKey: string; status: "ok" | "duplicate" | "failed" | "rejected"; summary: string; error?: string }) {
  const sql = await getSql();
  const now = new Date().toISOString();
  const inserted = await sql.query<{ id: string }>(
    `insert into shop_webhook_events (id, provider, event_key, status, summary, error, duplicates, created_at)
     values ($1, $2, $3, $4, $5, $6, 0, $7)
     on conflict (provider, event_key) do nothing
     returning id`,
    [uid("wh"), input.provider.slice(0, 40), input.eventKey.slice(0, 180), input.status, input.summary.slice(0, 240), (input.error || "").slice(0, 240), now],
  );
  if (inserted[0]) return { duplicate: false };
  await sql.query("update shop_webhook_events set duplicates = duplicates + 1 where provider = $1 and event_key = $2", [input.provider.slice(0, 40), input.eventKey.slice(0, 180)]);
  return { duplicate: true };
}

export async function acceptGetatextWebhook(token: string, body: unknown) {
  const configured = process.env.GETATEXT_WEBHOOK_TOKEN || "";
  if (!configured) return { http: 503, error: "GetaText webhook token is not configured." };
  if (!token || token !== configured) {
    await recordWebhook({ provider: "getatext", eventKey: `rejected:${uid("rej")}`, status: "rejected", summary: "Rejected webhook", error: "Bad token" });
    return { http: 401, error: "Rejected." };
  }
  const event = parseGetatextWebhook(body);
  if (!event) {
    await recordWebhook({ provider: "getatext", eventKey: `bad:${uid("bad")}`, status: "failed", summary: "Unreadable payload", error: "Missing id or code" });
    return { http: 400, error: "Unreadable payload." };
  }
  const eventKey = `${event.id}:${event.code}:${event.at || "once"}`;
  const sql = await getSql();
  const rows = await sql.query<FulfilmentRow>("select * from shop_fulfilments where provider_ref = $1 order by updated_at desc limit 1", [event.id]);
  const row = rows[0];
  if (!row) {
    await recordWebhook({ provider: "getatext", eventKey, status: "failed", summary: `No order for rental ${event.id}`, error: "Unmatched" });
    return { http: 202, error: "No matching order." };
  }
  const existing = messagesFrom(row.messages);
  const incoming: SmsMessage = { at: event.at, sender: event.service, text: "", code: event.code };
  const merged = mergeMessages(existing, [incoming]);
  if (merged.length === existing.length) {
    await recordWebhook({ provider: "getatext", eventKey, status: "ok", summary: `SMS ${event.id}` });
    return { http: 200, error: "", duplicate: true };
  }
  await saveFulfilmentMessages(row.order_id, merged, { phone: event.number, status: "received" });
  const recorded = await recordWebhook({ provider: "getatext", eventKey, status: "ok", summary: `SMS ${event.id}` });
  return { http: 200, error: "", duplicate: recorded.duplicate, orderId: row.order_id };
}

export type WebhookHealthRow = {
  id: string;
  name: string;
  support: string;
  endpoint: string;
  registration: string;
  signature: string;
  health: "Working" | "Configured but untested" | "Not configured" | "Unsupported by provider" | "Failed" | "Requires attention";
  note: string;
  lastEvent: string;
  ok: number;
  failed: number;
  duplicate: number;
  rejected: number;
};

export async function webhookHealth(): Promise<WebhookHealthRow[]> {
  const sql = await getSql();
  const events = await sql.query<{ provider: string; status: string; duplicates: number; created_at: string; error: string }>(
    "select provider, status, duplicates, created_at, error from shop_webhook_events order by created_at desc limit 400",
  );
  const tally = (provider: string) => {
    const rows = events.filter((item) => item.provider === provider);
    return {
      ok: rows.filter((item) => item.status === "ok").length,
      failed: rows.filter((item) => item.status === "failed").length,
      duplicate: rows.reduce((sum, item) => sum + (Number(item.duplicates) || 0), 0),
      rejected: rows.filter((item) => item.status === "rejected").length,
      lastEvent: rows[0]?.created_at || "",
      lastError: rows.find((item) => item.error)?.error || "",
    };
  };
  const paystackSecret = !!process.env.PAYSTACK_SECRET_KEY;
  const getatextToken = !!process.env.GETATEXT_WEBHOOK_TOKEN;
  const pay = tally("paystack");
  const geta = tally("getatext");
  const payHealth = !paystackSecret ? "Not configured" : pay.ok > 0 && pay.failed === 0 ? "Working" : pay.failed > 0 ? "Requires attention" : "Configured but untested";
  const getaHealth = !getatextToken ? "Not configured" : geta.failed > 0 && geta.ok === 0 ? "Requires attention" : "Configured but untested";
  return [
    {
      id: "paystack",
      name: "Paystack",
      support: "Wallet funding webhook (charge.success). Not a product-delivery webhook.",
      endpoint: "/api/paystack/webhook",
      registration: "Set in the Paystack dashboard. This app cannot confirm that Paystack has the URL saved.",
      signature: paystackSecret ? "HMAC SHA512 of the raw body. Invalid signatures are rejected." : "Secret is not set, so every call is rejected.",
      health: payHealth,
      note: pay.ok ? "A signed event was accepted by this app. That is not proof Paystack delivered it from their network unless the log time matches a real payment." : "No accepted Paystack event is stored.",
      ...pay,
    },
    {
      id: "5sim",
      name: "5sim (Number Server 1)",
      support: "No webhook in the public API. SMS is read with GET /v1/user/check/{id}.",
      endpoint: "None",
      registration: "Not applicable.",
      signature: "Not applicable.",
      health: "Unsupported by provider",
      note: "Polling is the documented method. A webhook was not implemented because 5sim does not document one.",
      lastEvent: "",
      ok: 0,
      failed: 0,
      duplicate: 0,
      rejected: 0,
    },
    {
      id: "getatext",
      name: "GetaText (USA numbers)",
      support: "Profile webhook for incoming codes. Polling remains POST /api/v1/rental-status.",
      endpoint: "/api/getatext/webhook",
      registration: getatextToken ? "Token is set. The URL still has to be saved in the GetaText profile by hand." : "GETATEXT_WEBHOOK_TOKEN is not set, so the endpoint refuses every call.",
      signature: "GetaText does not document a signature. The URL token is the only check.",
      health: getaHealth,
      note: geta.ok ? "An event with the correct token was stored. That does not mean GetaText itself delivered it." : "No live GetaText delivery has been recorded.",
      ...geta,
    },
    {
      id: "accszone",
      name: "AccsZone (Logs)",
      support: "No webhook. Credentials come back in the purchase response.",
      endpoint: "None",
      registration: "Not applicable.",
      signature: "Not applicable.",
      health: "Unsupported by provider",
      note: "The purchase call is the fulfilment. There is nothing to wait for afterwards.",
      lastEvent: "",
      ok: 0,
      failed: 0,
      duplicate: 0,
      rejected: 0,
    },
    {
      id: "instaking",
      name: "Instaking (SMM)",
      support: "No webhook in the API this shop uses. Status is polled with action=status.",
      endpoint: "None",
      registration: "Not applicable.",
      signature: "Not applicable.",
      health: "Unsupported by provider",
      note: "SMM sales are still closed. Status polling already exists for waiting SMM orders.",
      lastEvent: "",
      ok: 0,
      failed: 0,
      duplicate: 0,
      rejected: 0,
    },
    {
      id: "smeapi",
      name: "SME API (Data)",
      support: "The public purchase docs show a direct response and a ref. They do not document a webhook payload.",
      endpoint: "None",
      registration: "Not registered. A guessed endpoint was not added.",
      signature: "Not documented.",
      health: "Unsupported by provider",
      note: "Marketing pages mention webhooks, but there is no payload contract to implement or test.",
      lastEvent: "",
      ok: 0,
      failed: 0,
      duplicate: 0,
      rejected: 0,
    },
  ];
}

export async function webhookLog() {
  const sql = await getSql();
  return sql.query<{ id: string; provider: string; status: string; summary: string; error: string; duplicates: number; created_at: string }>(
    "select id, provider, status, summary, error, duplicates, created_at from shop_webhook_events order by created_at desc limit 80",
  );
}
