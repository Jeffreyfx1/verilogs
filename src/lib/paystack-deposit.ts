/** Paystack wallet credit rules. No network and no database. */

export const DEPOSIT_LABEL = {
  awaiting: "Awaiting payment confirmation",
  pending_credit: "Payment confirmed but credit pending",
  credited: "Successful and credited",
  failed: "Failed payment",
  needs_reconciliation: "Requires reconciliation",
} as const;

export type DepositStatus = keyof typeof DEPOSIT_LABEL;

export type PaystackMeta = { userId: string; credit: number; productId: string };

export type LedgerHit = { ref: string; amount: number; kind: string; createdAt: string };

export type DepositDecision =
  | { action: "already"; ledgerRef: string }
  | { action: "link_manual"; manualRef: string }
  | { action: "credit" }
  | { action: "reconcile"; reason: string };

const MANUAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MANUAL_SKEW_MS = 10 * 60 * 1000;
const MANUAL_NEAR_MS = 14 * 24 * 60 * 60 * 1000;

export function readPaystackMeta(metadata: unknown): PaystackMeta {
  let bag: Record<string, unknown> = {};
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) bag = parsed as Record<string, unknown>;
    } catch {
      bag = {};
    }
  } else if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    bag = metadata as Record<string, unknown>;
  }
  const custom = Array.isArray(bag.custom_fields) ? bag.custom_fields : [];
  const fromCustom = (name: string) => {
    for (const item of custom) {
      if (!item || typeof item !== "object") continue;
      const row = item as { variable_name?: unknown; display_name?: unknown; value?: unknown };
      const key = String(row.variable_name || row.display_name || "");
      if (key === name) return row.value;
    }
    return undefined;
  };
  const userId = String(bag.userId || bag.user_id || fromCustom("userId") || "").trim();
  const credit = Math.round(Number(bag.credit ?? fromCustom("credit") ?? 0));
  const productId = String(bag.productId || bag.product_id || fromCustom("productId") || "").trim();
  return { userId, credit: Number.isFinite(credit) && credit > 0 ? credit : 0, productId };
}

export function readWebhookEvent(raw: string): { event: string; reference: string } | null {
  try {
    const body = JSON.parse(raw) as { event?: unknown; data?: { reference?: unknown } };
    return { event: String(body?.event || ""), reference: String(body?.data?.reference || "").trim() };
  } catch {
    return null;
  }
}

/** Wallet naira from the verified Paystack charge (kobo already converted). */
export function walletCreditFromCharge(chargedNaira: number, requestedCredit: number): { amount: number } | { error: string } {
  const charged = Math.round(Number(chargedNaira) || 0);
  const credit = Math.round(Number(requestedCredit) || 0);
  if (!Number.isFinite(charged) || charged < 100) return { error: "Paystack amount is too small." };
  if (credit > charged) return { error: "Payment amount does not match the wallet credit." };
  return { amount: credit > 0 ? credit : charged };
}

export function resolveDepositAccount(input: {
  metadataUserId: string;
  customerEmail: string;
  storedUserId: string;
  users: { id: string; email: string; role: string }[];
}): { userId: string } | { error: string } {
  const email = input.customerEmail.trim().toLowerCase();
  const stored = input.storedUserId.trim();
  const meta = input.metadataUserId.trim();
  if (stored && meta && stored !== meta) return { error: "Stored account and Paystack metadata do not match." };
  const userId = stored || meta;
  if (userId) {
    const user = input.users.find((item) => item.id === userId);
    if (!user) return { error: "Account not found for this payment." };
    if (email && user.email.trim().toLowerCase() !== email) return { error: "Paystack email does not match the account on this payment." };
    return { userId: user.id };
  }
  const byEmail = input.users.filter((item) => item.role === "customer" && item.email.trim().toLowerCase() === email);
  if (email && byEmail.length === 1) return { userId: byEmail[0].id };
  if (byEmail.length > 1) return { error: "More than one account uses the Paystack email." };
  return { error: "Payment is missing the account it belongs to." };
}

export function decideDeposit(input: {
  reference: string;
  amount: number;
  paidAt: string;
  ledger: LedgerHit[];
  force?: boolean;
}): DepositDecision {
  const payRef = `paystack:${input.reference}`;
  if (input.ledger.some((row) => row.ref === payRef)) return { action: "already", ledgerRef: payRef };
  if (input.force) return { action: "credit" };
  const paid = Date.parse(input.paidAt);
  if (!Number.isFinite(paid)) return { action: "reconcile", reason: "Paystack did not say when the payment was made, so a manual credit was not assumed." };
  const from = paid - MANUAL_SKEW_MS;
  const until = paid + MANUAL_WINDOW_MS;
  const manual = input.ledger.filter((row) => {
    if (row.kind !== "topup" || !row.ref.startsWith("adjust:")) return false;
    if (Math.round(row.amount) !== Math.round(input.amount)) return false;
    const at = Date.parse(row.createdAt);
    return Number.isFinite(at) && at >= from && at <= until;
  });
  if (manual.length === 1) return { action: "link_manual", manualRef: manual[0].ref };
  if (manual.length > 1) return { action: "reconcile", reason: "More than one manual wallet credit matches this payment." };
  const near = input.ledger.filter((row) => {
    if (row.kind !== "topup" || !row.ref.startsWith("adjust:")) return false;
    if (Math.round(row.amount) === Math.round(input.amount) || Math.round(row.amount) <= 0) return false;
    const at = Date.parse(row.createdAt);
    return Number.isFinite(at) && at >= from && at <= paid + MANUAL_NEAR_MS;
  });
  if (near.length > 0) return { action: "reconcile", reason: "A manual wallet credit near this payment does not match the Paystack amount, so nothing was added." };
  return { action: "credit" };
}

/** HTTP 200 only after a charge.success is recorded, or the event is not a charge we must credit. A pending or unreachable verify is not acknowledged, so Paystack retries. */
export function shouldAckWebhook(input: {
  signatureOk: boolean;
  event: string;
  reference: string;
  verify: "success" | "failed" | "pending" | "unavailable";
  recorded: boolean;
}) {
  if (!input.signatureOk) return false;
  if (input.event !== "charge.success") return true;
  if (!input.reference) return false;
  if (input.verify === "unavailable" || input.verify === "pending") return false;
  if (input.verify === "success" || input.verify === "failed") return input.recorded;
  return false;
}

/** Start of the Lagos civil day or month as UTC. Africa/Lagos is WAT, UTC+1, with no daylight saving. */
export function lagosStart(now: Date, part: "day" | "month") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const pick = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const year = pick("year");
  const month = pick("month");
  const day = part === "month" ? 1 : pick("day");
  return new Date(Date.UTC(year, month - 1, day, -1, 0, 0)).toISOString();
}

export function lagosWindow(now = new Date()) {
  return { today: lagosStart(now, "day"), month: lagosStart(now, "month") };
}

export type CustomerRow = { email: string; role: string; createdAt: string; deleted?: boolean };

/** Distinct customer emails. Admins, staff, deleted rows and blank emails are out. */
export function countCustomers(rows: CustomerRow[], now = new Date()) {
  const window = lagosWindow(now);
  const seen = new Map<string, string>();
  for (const row of rows) {
    const email = String(row.email || "").trim().toLowerCase();
    if (!email || row.deleted) continue;
    if (row.role !== "customer") continue;
    const created = String(row.createdAt || "");
    const prev = seen.get(email);
    if (!prev || (created && created < prev)) seen.set(email, created);
  }
  let today = 0;
  let month = 0;
  for (const created of seen.values()) {
    if (created >= window.today) today += 1;
    if (created >= window.month) month += 1;
  }
  return { total: seen.size, today, month };
}
