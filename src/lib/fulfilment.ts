import { hideSupplier, parseAccountDelivery, type ParsedAccount } from "@/lib/account-delivery";
import { mapFiveSimActivation, mapGetaTextRental, phaseFromStored } from "@/lib/number-live";
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
  cancellable: boolean;
  phase: "waiting" | "received" | "completed" | "cancelled" | "expired" | "unknown";
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
  const live = mapFiveSimActivation(body);
  return { phone: live.phone, status: live.providerStatus, messages: live.messages, terminal: live.terminal, expiresAt: live.expiresAt };
}

export function parseGetatextStatus(body: unknown): { phone: string; status: string; messages: SmsMessage[]; terminal: boolean; expiresAt: string } {
  const live = mapGetaTextRental(body);
  return { phone: live.phone, status: live.providerStatus, messages: live.messages, terminal: live.terminal, expiresAt: live.expiresAt };
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
  const accounts = kind === "logs" || kind === "vpn" ? parseAccountDelivery(deliverySource, `${order.title || ""}\n${order.service || ""}\n${order.detail || ""}`) : [];
  const phone = String(order.phone || "").trim();
  const fromSms = stored.map((item) => item.code).filter(Boolean).pop() || "";
  const code = kind === "number" ? (fromSms || (phone ? String(order.code || "") : "")) : "";
  const reference = String(order.providerOrderId || "").trim();
  const providerStatus = String(order.providerStatus || "");
  const phase = kind === "number" ? phaseFromStored({ ...order, providerStatus, code, messages: stored }) : "unknown";
  const terminal = phase === "completed" || phase === "cancelled" || phase === "expired";
  const supplier = order.server || "";
  const customerLogs = !admin && (kind === "logs" || kind === "vpn");
  const note = kind === "number"
    ? (code ? "The code below is what was returned for this number." : !terminal ? "Waiting for an SMS. Nothing is shown until it arrives." : "No SMS was stored for this order.")
    : kind === "logs" || kind === "vpn"
      ? (accounts.length ? "The account details from this purchase are below." : "No account details were stored for this order.")
      : (delivery.length ? "Stored delivery for this order." : "No extra delivery was stored for this order.");
  const facebook = accounts.some((account) => account.layout === "facebook");
  const cancellableServer = order.server === "Server 1" || order.server === "USA" || order.server === "Rent number";
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
    delivery: kind === "number" || facebook ? [] : delivery,
    accounts,
    messages: stored,
    code,
    poll: kind === "number" && !terminal && !!reference,
    cancellable: kind === "number" && phase === "waiting" && !!reference && cancellableServer,
    phase,
    note: customerLogs ? hideSupplier(note, supplier) : note,
    createdAt: order.createdAt || "",
    expiresAt: order.expiresAt || "",
    admin,
  };
}
