/** Turns a stored order into the purchase result. It never invents a phone, code, or credential. */

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
  messages: SmsMessage[];
  code: string;
  poll: boolean;
  note: string;
  createdAt: string;
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

export function parseFiveSimCheck(body: unknown): { phone: string; status: string; messages: SmsMessage[]; terminal: boolean } {
  const json = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const status = String(json.status || "");
  const phone = typeof json.phone === "string" ? json.phone : "";
  const sms = Array.isArray(json.sms) ? json.sms : [];
  const messages = sms.map((item) => {
    const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      at: String(row.created_at || row.date || ""),
      sender: String(row.sender || ""),
      text: String(row.text || ""),
      code: String(row.code || ""),
    };
  }).filter((item) => item.text || item.code);
  const terminal = /RECEIVED|CANCELED|CANCELLED|TIMEOUT|FINISHED|BANNED/i.test(status);
  return { phone, status, messages, terminal };
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

export function purchaseView(order: PurchaseOrder, messages: SmsMessage[] = []): PurchaseView {
  const kind = purchaseKind(order.category);
  const stored = mergeMessages(order.messages || [], messages);
  const deliverySource = order.delivery || (kind === "number" ? "" : order.code || "");
  const delivery = linesOf(deliverySource);
  const code = kind === "number" ? (stored.map((item) => item.code).filter(Boolean).pop() || "") : "";
  const phone = String(order.phone || "").trim();
  const reference = String(order.providerOrderId || "").trim();
  const providerStatus = String(order.providerStatus || "");
  const finished = order.status === "received" || order.status === "completed" || order.status === "refunded" || /RECEIVED|CANCELED|CANCELLED|TIMEOUT|FINISHED|BANNED|complete|expire/i.test(providerStatus);
  const waiting = order.status === "waiting" && !finished;
  const note = kind === "number"
    ? (code ? "The code below is what the provider returned." : waiting ? "Waiting for the provider to send an SMS. Nothing is shown until it arrives." : "No SMS was stored for this order.")
    : kind === "logs"
      ? (delivery.length ? "These are the lines the provider returned with the purchase." : "The provider did not return delivery lines for this order.")
      : kind === "vpn"
        ? (delivery.length ? "These are the VPN details stored with the order." : "No VPN configuration was stored for this order.")
        : (delivery.length ? "Stored delivery from the provider." : "No extra provider payload was stored for this order.");
  return {
    orderId: order.id,
    kind,
    title: order.title,
    amount: order.amount,
    status: order.status,
    providerStatus,
    server: order.server || "",
    country: order.country || "",
    service: order.service || "",
    network: order.network || "",
    phone: kind === "number" || kind === "data" ? phone : phone,
    reference,
    delivery: kind === "number" ? [] : delivery,
    messages: stored,
    code,
    poll: kind === "number" && waiting && !!reference,
    note,
    createdAt: order.createdAt || "",
  };
}
