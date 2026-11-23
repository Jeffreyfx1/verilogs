import { hideSupplier, parseAccountDelivery, type ParsedAccount } from "@/lib/account-delivery";
export { mapFiveSimStatus, fiveSimCancelDecision } from "@/lib/fivesim-status";

export type SmsMessage = { at: string; sender: string; text: string; code: string };

export type PurchaseOrder = {
  id: string;
  userId?: string;
  category: string;
  title: string;
  amount: number;
  status: string;
  phone?: string;
  code?: string;
  server?: string;
  network?: string;
  detail?: string;
  providerStatus?: string;
  providerOrderId?: string;
  delivery?: string;
  country?: string;
  service?: string;
  messages?: SmsMessage[];
  createdAt?: string;
  expiresAt?: string;
};

export type PurchaseView = {
  orderId: string;
  kind: "number" | "logs" | "vpn" | "data" | "other";
  title: string;
  amount: number;
  status: string;
  providerStatus: string;
  server: string;
  country: string;
  service: string;
  network: string;
  phone: string;
  reference: string;
  delivery: string[];
  accounts: ParsedAccount[];
  messages: SmsMessage[];
  code: string;
  poll: boolean;
  note: string;
  createdAt: string;
  expiresAt: string;
  admin: boolean;
};

const NUMBER = new Set(["number", "numbers", "rent", "usa"]);

export function purchaseKind(category: string): PurchaseView["kind"] {
  if (NUMBER.has(category)) return "number";
  if (category === "logs") return "logs";
  if (category === "vpn") return "vpn";
  if (category === "data" || category === "airtime") return "data";
  return "other";
}

export function mergeMessages(current: SmsMessage[], incoming: SmsMessage[]) {
  const seen = new Set(current.map(messageKey));
  const next = [...current];
  for (const message of incoming) {
    const key = messageKey(message);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(message);
  }
  return next;
}

function messageKey(message: SmsMessage) {
  return `${message.at}|${message.sender}|${message.text}|${message.code}`.trim();
}

export function parseFiveSimCheck(body: unknown): { phone: string; status: string; messages: SmsMessage[]; terminal: boolean; expiresAt: string } {
  const root = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const json = root.data && typeof root.data === "object" ? root.data as Record<string, unknown> : root;
  const status = String(json.status || "");
  const phone = typeof json.phone === "string" ? json.phone : "";
  const raw = Array.isArray(json.sms) ? json.sms : json.sms && typeof json.sms === "object" ? [json.sms] : [];
  const messages = raw.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const text = String(row.text || row.message || "");
    const code = String(row.code || "").trim() || codeFromText(text);
    return {
      at: String(row.created_at || row.date || ""),
      sender: String(row.sender || row.from || ""),
      text,
      code,
    };
  }).filter((item) => item.text || item.code);
  const terminal = /CANCELED|CANCELLED|TIMEOUT|FINISHED|BANNED/i.test(status);
  return { phone, status, messages, terminal, expiresAt: typeof json.expires === "string" ? json.expires : "" };
}

function codeFromText(text: string) {
  const match = text.match(/\b\d{4,8}\b/);
  return match ? match[0] : "";
}

export function parseGetatextStatus(body: unknown): { phone: string; status: string; messages: SmsMessage[]; terminal: boolean } {
  const json = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const status = String(json.status || "");
  const phone = String(json.number || "");
  const codes = Array.isArray(json.codes) ? json.codes.map((item) => String(item || "")).filter(Boolean) : [];
  const latest = String(json.code || "");
  const list = codes.length ? codes : latest ? [latest] : [];
  const messages = list.map((code) => ({ at: "", sender: String(json.service_name || ""), text: "", code }));
  const terminal = /complete|cancel|expire|timeout|finished/i.test(status);
  return { phone, status, messages, terminal };
}

export function parseGetatextWebhook(body: unknown): { id: string; code: string; number: string; at: string; service: string; status: string } | null {
  const json = body && typeof body === "object" ? body as Record<string, unknown> : null;
  if (!json || json.id == null || json.code == null) return null;
  const id = String(json.id).replace(/[^\d]/g, "");
  const code = String(json.code).trim();
  if (!id || !code) return null;
  return {
    id,
    code,
    number: String(json.number || ""),
    at: String(json.received_at || ""),
    service: String(json.service_name || ""),
    status: String(json.status || ""),
  };
}

function linesOf(value: string) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function purchaseView(order: PurchaseOrder, messages: SmsMessage[] = [], options?: { admin?: boolean }): PurchaseView {
  const kind = purchaseKind(order.category);
  const admin = !!options?.admin;
  const stored = mergeMessages(order.messages || [], messages);
  const deliverySource = order.delivery || (kind === "number" ? "" : order.code || "");
  const delivery = linesOf(deliverySource);
  const accounts = kind === "logs" || kind === "vpn" ? parseAccountDelivery(deliverySource, `${order.title || ""}\n${order.detail || ""}`) : [];
  const code = kind === "number" ? (stored.map((item) => item.code).filter(Boolean).pop() || (order.code || "")) : "";
  const phone = String(order.phone || "").trim();
  const reference = String(order.providerOrderId || "").trim();
  const providerStatus = String(order.providerStatus || "");
  const closed = order.status === "completed" || order.status === "refunded" || /CANCELED|CANCELLED|TIMEOUT|FINISHED|BANNED/i.test(providerStatus);
  const waiting = !closed && !code;
  const supplier = order.server || "";
  const customerLogs = !admin && (kind === "logs" || kind === "vpn");
  const note = kind === "number"
    ? (code ? "The code below is what was returned for this number." : waiting ? "Waiting for an SMS. Nothing is shown until it arrives." : "No SMS was stored for this order.")
    : kind === "logs" || kind === "vpn"
      ? (accounts.length ? "The account details from this purchase are below." : "No account details were stored for this order.")
      : (delivery.length ? "Stored delivery for this order." : "No extra delivery was stored for this order.");
  return {
    orderId: order.id,
    kind,
    title: customerLogs ? hideSupplier(order.title, supplier) : order.title,
    amount: order.amount,
    status: order.status,
    providerStatus: customerLogs ? "" : providerStatus,
    server: customerLogs ? "" : (order.server || ""),
    country: order.country || "",
    service: customerLogs ? hideSupplier(order.service || "", supplier) : (order.service || ""),
    network: customerLogs ? hideSupplier(order.network || "", supplier) : (order.network || ""),
    phone: kind === "number" || kind === "data" ? phone : phone,
    reference: customerLogs ? "" : reference,
    delivery: kind === "number" ? [] : delivery,
    accounts,
    messages: stored,
    code,
    poll: kind === "number" && waiting && !!reference,
    note: customerLogs ? hideSupplier(note, supplier) : note,
    createdAt: order.createdAt || "",
    expiresAt: order.expiresAt || "",
    admin,
  };
}
