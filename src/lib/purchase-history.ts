/** Customer purchase history. Reads existing orders. It does not create or change them. */

export const BILL_CATEGORIES = new Set(["cable", "electricity", "exam", "giftcard", "betting"]);
export const AIRTIME_CLOSED = "Airtime is coming soon. Nothing was sent.";
export const SMM_CLOSED = "SMM is coming soon. Nothing was sent.";
export const BILL_CLOSED = "Bill payment is no longer available. Nothing was sent.";

export function airtimeSalesOpen() {
  return false;
}

export function smmSalesOpen() {
  return false;
}

export function isRetiredBill(category: string) {
  return BILL_CATEGORIES.has(category);
}

export type HistoryFilter = "all" | "logs" | "vpn" | "numbers" | "other" | "data" | "rent" | "bought";

export type HistoryOrder = {
  id: string;
  userId: string;
  category: string;
  title: string;
  amount: number;
  status: string;
  createdAt: string;
  phone?: string;
  code?: string;
  server?: string;
  network?: string;
  detail?: string;
  providerStatus?: string;
  providerOrderId?: string;
  refillId?: string;
  refillAvailable?: boolean;
};

export function purchaseGroup(category: string): "logs" | "vpn" | "numbers" | "other" {
  if (category === "logs") return "logs";
  if (category === "vpn") return "vpn";
  if (category === "numbers" || category === "rent" || category === "number" || category === "usa") return "numbers";
  return "other";
}

export function matchesHistoryFilter(category: string, filter: HistoryFilter) {
  if (filter === "all") return true;
  if (filter === "data") return category === "data";
  if (filter === "rent") return category === "rent";
  if (filter === "bought") return category === "numbers" || category === "number" || category === "usa";
  return purchaseGroup(category) === filter;
}

export function purchaseTypeLabel(category: string) {
  const group = purchaseGroup(category);
  if (group === "logs") return "Logs";
  if (group === "vpn") return "VPN";
  if (category === "rent") return "Rent";
  if (group === "numbers") return "Numbers";
  if (category === "smm") return "SMM";
  if (category === "data") return "Data";
  if (category === "airtime") return "Airtime";
  if (isRetiredBill(category)) return "Bills";
  return "Other products";
}

export function orderQuantity(detail: string) {
  try {
    const parsed = JSON.parse(detail) as { quantity?: number };
    const qty = Math.round(Number(parsed?.quantity) || 0);
    return qty > 0 ? qty : 1;
  } catch {
    return 1;
  }
}

export function historyFilterFromHash(hash: string): HistoryFilter {
  const name = hash.replace(/^#/, "");
  if (name === "logs" || name === "vpn" || name === "numbers" || name === "other" || name === "data" || name === "rent" || name === "bought") return name;
  if (name === "usa") return "bought";
  return "all";
}

export function listPurchases<T extends HistoryOrder>(orders: T[], input: { userId: string; filter: HistoryFilter; q?: string }) {
  const q = (input.q || "").trim().toLowerCase();
  const seen = new Set<string>();
  return orders
    .filter((order) => order.userId === input.userId)
    .filter((order) => {
      if (!order.id || seen.has(order.id)) return false;
      seen.add(order.id);
      return true;
    })
    .filter((order) => matchesHistoryFilter(order.category, input.filter))
    .filter((order) => {
      if (!q) return true;
      return [order.title, order.category, purchaseTypeLabel(order.category), order.status, order.phone, order.code, order.server, order.network, order.detail, order.providerStatus]
        .join(" ")
        .toLowerCase()
        .includes(q);
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export function pagePurchases<T>(rows: T[], pageSize: number, page: number) {
  const end = Math.max(1, pageSize) * Math.max(1, page);
  return { rows: rows.slice(0, end), more: rows.length > end };
}
