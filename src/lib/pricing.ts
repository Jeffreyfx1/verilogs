/** Fixed naira profit per completed order. Percent tiers are no longer used. */

export type MarginTier = {
  id: string;
  minRate: number;
  maxRate: number;
  markupPercent: number;
  minProfit: number;
  enabled: boolean;
  providerId: string;
  service: string;
};

export type MarginOverride = {
  id: string;
  providerId: string;
  service: string;
  markupPercent: number;
  minProfit: number;
  enabled: boolean;
};

export type PricingSettings = {
  auto: boolean;
  roundTo: number;
  tiers: MarginTier[];
  overrides: MarginOverride[];
};

export type FixedProfits = {
  general: number;
  airtime: number;
  data: number;
};

export const DEFAULT_PROFITS: FixedProfits = { general: 1500, airtime: 300, data: 300 };

export function profitsOf(input: Partial<FixedProfits> | null | undefined): FixedProfits {
  return {
    general: moneyOr(input?.general, DEFAULT_PROFITS.general),
    airtime: moneyOr(input?.airtime, DEFAULT_PROFITS.airtime),
    data: moneyOr(input?.data, DEFAULT_PROFITS.data),
  };
}

function moneyOr(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n);
}

export function profitFor(category: string, profits: FixedProfits = DEFAULT_PROFITS) {
  const name = String(category || "").toLowerCase();
  if (name === "airtime") return profits.airtime;
  if (name === "data") return profits.data;
  return profits.general;
}

export function defaultPricing(): PricingSettings {
  return { auto: false, roundTo: 1, tiers: [], overrides: [] };
}

export function pricingOf(input: Partial<PricingSettings> | null | undefined): PricingSettings {
  return defaultPricing();
}

/** Kept so older rows still parse. Pricing no longer reads success rate. */
export function successRateOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return null;
  return rate;
}

export type PriceQuote = {
  price: number;
  purchaseNgn: number;
  percent: number;
  profit: number;
  tierId: string | null;
  reason: "fixed";
};

export type SellQuote =
  | { ok: true; charge: number; costNgn: number; profit: number; quantity: number }
  | { ok: false; error: string };

/** Customer total = converted provider cost for the quantity + one fixed profit. */
export function sellQuote(input: {
  category: string;
  unitCost: number;
  currency: "NGN" | "USD";
  usdRate: number;
  quantity?: number;
  variable?: boolean;
  face?: number;
  profits?: Partial<FixedProfits> | null;
}): SellQuote {
  const profits = profitsOf(input.profits);
  const profit = profitFor(input.category, profits);
  const quantity = Math.max(1, Math.round(Number(input.quantity) || 1));
  if (input.variable && (input.category === "airtime" || input.category === "data")) {
    const face = Math.round(Number(input.face) || 0);
    if (!(face > 0)) return { ok: false, error: "Enter an amount." };
    return { ok: true, charge: face + profit, costNgn: face, profit, quantity: 1 };
  }
  const unitCost = Number(input.unitCost) || 0;
  const fx = input.currency === "USD" ? Number(input.usdRate) || 0 : 1;
  if (input.currency === "USD" && !(fx > 0)) return { ok: false, error: "Set the naira exchange rate before this can be priced." };
  if (!(unitCost > 0)) return { ok: false, error: "This item has no price yet." };
  const unitNgn = Math.round(unitCost * fx);
  const costNgn = unitNgn * quantity;
  return { ok: true, charge: costNgn + profit, costNgn, profit, quantity };
}

export function customerPrice(input: {
  cost: number;
  currency: "NGN" | "USD";
  usdRate: number;
  category?: string;
  quantity?: number;
  profits?: Partial<FixedProfits> | null;
  successRate?: number | null;
  pricing?: PricingSettings;
  providerId?: string;
  service?: string;
  providerPercent?: number | null;
  defaultPercent?: number;
}): PriceQuote {
  const quote = sellQuote({
    category: input.category || "",
    unitCost: input.cost,
    currency: input.currency,
    usdRate: input.usdRate,
    quantity: input.quantity || 1,
    profits: input.profits,
  });
  if (!quote.ok) return { price: 0, purchaseNgn: 0, percent: 0, profit: 0, tierId: null, reason: "fixed" };
  return { price: quote.charge, purchaseNgn: quote.costNgn, percent: 0, profit: quote.profit, tierId: null, reason: "fixed" };
}

export type ProfitRow = { category: string; profit: number; orders: number };
export type ProfitReport = {
  total: number;
  rows: ProfitRow[];
  unverified: number;
  updatedAt: string;
};

const PROFIT_ORDER = ["Logs", "SMM", "USA Services", "Number Server 1", "Number Server 2", "Number Server 3", "Airtime", "Data"];

export function profitBucket(category: string, server: string) {
  const name = String(category || "").toLowerCase();
  if (name === "logs") return "Logs";
  if (name === "smm") return "SMM";
  if (name === "usa") return "USA Services";
  if (name === "airtime") return "Airtime";
  if (name === "data") return "Data";
  if (name === "number" || name === "numbers" || name === "rent") {
    if (/server\s*3/i.test(server)) return "Number Server 3";
    if (/server\s*2/i.test(server)) return "Number Server 2";
    return "Number Server 1";
  }
  return "";
}

/** Uses the amount and provider cost stored on the order. Missing cost is unverified, not zero. */
export function summarizeProfit(orders: Array<{ status: string; amount: number; cost: number; gain?: number; category: string; server: string }>, now = new Date().toISOString()): ProfitReport {
  const buckets = new Map<string, ProfitRow>();
  for (const name of PROFIT_ORDER) buckets.set(name, { category: name, profit: 0, orders: 0 });
  let unverified = 0;
  for (const order of orders) {
    if (order.status !== "completed") continue;
    const bucket = profitBucket(order.category, order.server);
    if (!bucket) continue;
    const cost = Number(order.cost);
    const amount = Number(order.amount);
    if (!(cost > 0) || !Number.isFinite(amount)) {
      unverified += 1;
      continue;
    }
    const row = buckets.get(bucket)!;
    row.profit += Math.round(amount - cost);
    row.orders += 1;
  }
  const rows = PROFIT_ORDER.map((name) => buckets.get(name)!);
  return { total: rows.reduce((sum, row) => sum + row.profit, 0), rows, unverified, updatedAt: now };
}
