/** Customer-facing lifecycle. A code is not completion. */
export type NumberPhase = "waiting" | "received" | "completed" | "cancelled" | "expired" | "unknown";

export type SmsMessage = { at: string; sender: string; text: string; code: string };

export type LiveNumber = {
  phone: string;
  providerStatus: string;
  phase: NumberPhase;
  messages: SmsMessage[];
  expiresAt: string;
  cancellable: boolean;
  terminal: boolean;
};

type OrderLike = {
  status: string;
  phone?: string;
  code?: string;
  providerStatus?: string;
  expiresAt?: string;
  messages?: SmsMessage[];
};

const TERMINAL = new Set<NumberPhase>(["completed", "cancelled", "expired"]);

function alignMessages(current: SmsMessage[], incoming: SmsMessage[]) {
  if (!incoming.length) return current;
  const used = new Set<number>();
  const base = incoming.map((message) => {
    const match = current.findIndex((item, index) => !used.has(index) && !!item.code && item.code === message.code);
    if (match < 0) return message;
    used.add(match);
    const prev = current[match];
    return {
      at: message.at || prev.at,
      sender: message.sender || prev.sender,
      text: message.text || prev.text,
      code: message.code || prev.code,
    };
  });
  for (let index = 0; index < current.length; index += 1) {
    if (used.has(index)) continue;
    const item = current[index];
    const key = messageKey(item);
    if (!key || base.some((row) => messageKey(row) === key)) continue;
    base.push(item);
  }
  return base;
}

function messageKey(message: SmsMessage) {
  return `${message.at}|${message.sender}|${message.text}|${message.code}`.trim();
}

function cleanCode(value: unknown) {
  if (value == null) return "";
  const code = String(value).trim();
  if (!code || code.toLowerCase() === "null") return "";
  return code;
}

function newYorkOffsetMinutes(utcMillis: number) {
  const zone = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
    year: "numeric",
  }).formatToParts(new Date(utcMillis)).find((part) => part.type === "timeZoneName")?.value || "";
  const match = zone.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if (!match) return -300;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

/**
 * GetaText sends `end_time` as a clock time with no zone, in the same form as
 * `deadline`, which the API documents as America/New_York. Reading that string
 * as UTC puts a short rental several hours in the past, so the page shows
 * Ended while the provider timer is still running.
 */
export function easternWallToIso(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isFinite(date.getTime()) ? date.toISOString() : "";
  }
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw || raw.toLowerCase() === "null") return "";
  if (/^\d{10,13}$/.test(raw)) return easternWallToIso(Number(raw));
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
  }
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return "";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] || 0);
  let utc = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let pass = 0; pass < 2; pass += 1) {
    const offset = newYorkOffsetMinutes(utc);
    utc = Date.UTC(year, month - 1, day, hour, minute, second) - offset * 60_000;
  }
  return new Date(utc).toISOString();
}

function bag(body: unknown) {
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

/** GetaText rental-status and rent-a-number. `deadline` is a SIM rotation, not the rental timer. */
export function mapGetaTextRental(body: unknown): LiveNumber {
  const json = bag(body);
  const providerStatus = String(json.status || "").trim().toLowerCase();
  const phone = String(json.number || "");
  const listed = Array.isArray(json.codes) ? json.codes.map(cleanCode).filter(Boolean) : [];
  const latest = cleanCode(json.code);
  const codes = listed.length ? listed : latest ? [latest] : [];
  const sender = String(json.service_name || "");
  const messages = codes.map((code) => ({ at: "", sender, text: "", code }));
  const phase = getatextPhase(providerStatus, messages.length > 0);
  return {
    phone,
    providerStatus,
    phase,
    messages,
    expiresAt: easternWallToIso(json.end_time),
    cancellable: phase === "waiting",
    terminal: TERMINAL.has(phase),
  };
}

function getatextPhase(status: string, hasCode: boolean): NumberPhase {
  if (status === "completed") return "completed";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "expired") return "expired";
  if (status === "active" || status === "viewed" || status === "success" || status === "pending" || !status) {
    return hasCode || status === "viewed" ? "received" : "waiting";
  }
  if (hasCode) return "received";
  return "unknown";
}

export function mapFiveSimActivation(body: unknown): LiveNumber {
  const root = bag(body);
  const json = bag(root.data && typeof root.data === "object" ? root.data : root);
  const providerStatus = String(json.status || "").trim().toUpperCase();
  const phone = typeof json.phone === "string" ? json.phone : "";
  const raw = Array.isArray(json.sms) ? json.sms : json.sms && typeof json.sms === "object" ? [json.sms] : [];
  const messages = raw.map((item) => {
    const row = bag(item);
    const text = String(row.text || row.message || "");
    const code = cleanCode(row.code) || (text.match(/\b\d{4,8}\b/) || [""])[0];
    return { at: String(row.created_at || row.date || ""), sender: String(row.sender || row.from || ""), text, code };
  }).filter((item) => item.text || item.code);
  const phase = fiveSimPhase(providerStatus, messages.length > 0);
  const expires = typeof json.expires === "string" ? json.expires : "";
  const expiresAt = expires && Number.isFinite(Date.parse(expires)) ? new Date(expires).toISOString() : "";
  return {
    phone,
    providerStatus,
    phase,
    messages,
    expiresAt,
    cancellable: phase === "waiting",
    terminal: TERMINAL.has(phase),
  };
}

function fiveSimPhase(status: string, hasSms: boolean): NumberPhase {
  if (status === "FINISHED") return "completed";
  if (status === "CANCELED" || status === "CANCELLED" || status === "BANNED") return "cancelled";
  if (status === "TIMEOUT") return "expired";
  if (status === "RECEIVED") return hasSms ? "received" : "waiting";
  if (status === "PENDING" || !status) return "waiting";
  return "unknown";
}

export function phaseFromStored(order: { status?: string; providerStatus?: string; code?: string; messages?: { code?: string }[] }): NumberPhase {
  const provider = String(order.providerStatus || "").trim().toLowerCase();
  if (provider === "expired" || provider === "timeout") return "expired";
  if (provider === "cancelled" || provider === "canceled" || provider === "banned") return "cancelled";
  if (provider === "completed" || provider === "finished") return "completed";
  if (order.status === "refunded") return "cancelled";
  if (order.status === "completed") return "completed";
  const hasCode = !!(order.code || order.messages?.some((item) => item.code));
  if (provider === "received" || provider === "viewed" || order.status === "received" || hasCode) return "received";
  return "waiting";
}

export function orderIsOpen(order: { status?: string; providerStatus?: string }) {
  return !TERMINAL.has(phaseFromStored(order));
}

export function applyLiveToOrder<T extends OrderLike>(order: T, live: LiveNumber): { order: T; refund: boolean } {
  const messages = alignMessages(order.messages || [], live.messages);
  const code = messages.map((item) => item.code).filter(Boolean).pop() || (live.phase === "waiting" ? "" : order.code || "");
  const phone = live.phone || order.phone || "";
  const providerStatus = live.providerStatus || order.providerStatus || "";
  const expiresAt = live.expiresAt || order.expiresAt || "";
  if (live.phase === "unknown") {
    const next = { ...order, messages, phone, code: code || order.code || "", providerStatus: order.providerStatus || providerStatus, expiresAt };
    return { order: next, refund: false };
  }
  if (order.status === "refunded") return { order: { ...order, messages, phone, providerStatus, expiresAt }, refund: false };
  let status = order.status;
  let refund = false;
  if (live.phase === "completed") status = "completed";
  else if (live.phase === "cancelled") {
    status = "refunded";
    refund = true;
  } else if (live.phase === "expired") status = order.status === "completed" ? "completed" : order.status === "received" ? "received" : "waiting";
  else if (live.phase === "received") status = order.status === "completed" ? "completed" : "received";
  else if (live.phase === "waiting" && order.status !== "completed") status = "waiting";
  return { order: { ...order, status, phone, code, messages, providerStatus, expiresAt }, refund };
}

/** Cancel-rental is confirmed only by status cancelled. A lock or a timeout is not a refund. */
export function getatextCancelResult(body: unknown, httpOk: boolean): "confirmed" | "rejected" | "unknown" {
  const json = bag(body);
  const status = String(json.status || "").trim().toLowerCase();
  const errors = String(json.errors || json.message || "");
  if (/early_cancel|cannot be cancelled|not cancellable|already completed|has a code/i.test(errors)) return "rejected";
  if (!httpOk) return "rejected";
  if (status === "cancelled" || status === "canceled") return "confirmed";
  return "unknown";
}
