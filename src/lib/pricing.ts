/** One pricing formula. Markup percent is not the old multiplier (1.6) and not the ₦1,850–₦2,700 spread. */

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

export const DEFAULT_TIERS: MarginTier[] = [
  { id: "tier-95", minRate: 95, maxRate: 100, markupPercent: 35, minProfit: 0, enabled: true, providerId: "", service: "" },
  { id: "tier-90", minRate: 90, maxRate: 94.999, markupPercent: 30, minProfit: 0, enabled: true, providerId: "", service: "" },
  { id: "tier-80", minRate: 80, maxRate: 89.999, markupPercent: 25, minProfit: 0, enabled: true, providerId: "", service: "" },
  { id: "tier-70", minRate: 70, maxRate: 79.999, markupPercent: 20, minProfit: 0, enabled: true, providerId: "", service: "" },
  { id: "tier-low", minRate: 0, maxRate: 69.999, markupPercent: 15, minProfit: 0, enabled: true, providerId: "", service: "" },
];

export function defaultPricing(): PricingSettings {
  return { auto: true, roundTo: 1, tiers: DEFAULT_TIERS.map((tier) => ({ ...tier })), overrides: [] };
}

export function pricingOf(input: Partial<PricingSettings> | null | undefined): PricingSettings {
  const base = defaultPricing();
  if (!input || typeof input !== "object") return base;
  const tiers = Array.isArray(input.tiers) && input.tiers.length ? input.tiers.map(cleanTier).filter((tier) => tier.markupPercent >= 0) : base.tiers;
  const overrides = Array.isArray(input.overrides) ? input.overrides.map(cleanOverride).filter((row) => row.markupPercent >= 0) : [];
  const roundTo = Number(input.roundTo);
  return {
    auto: input.auto !== false,
    roundTo: roundTo === 5 || roundTo === 10 ? roundTo : 1,
    tiers,
    overrides,
  };
}

function cleanTier(row: Partial<MarginTier>): MarginTier {
  return {
    id: String(row.id || `tier-${row.minRate}-${row.maxRate}`),
    minRate: Number(row.minRate) || 0,
    maxRate: Number(row.maxRate) || 0,
    markupPercent: Number(row.markupPercent) || 0,
    minProfit: Math.max(0, Math.round(Number(row.minProfit) || 0)),
    enabled: row.enabled !== false,
    providerId: String(row.providerId || ""),
    service: String(row.service || "").trim(),
  };
}

function cleanOverride(row: Partial<MarginOverride>): MarginOverride {
  return {
    id: String(row.id || `ovr-${row.providerId}-${row.service}`),
    providerId: String(row.providerId || ""),
    service: String(row.service || "").trim(),
    markupPercent: Number(row.markupPercent) || 0,
    minProfit: Math.max(0, Math.round(Number(row.minProfit) || 0)),
    enabled: row.enabled !== false,
  };
}

/** Missing or invalid success rates stay null so they never fall into the top tier. */
export function successRateOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return null;
  return rate;
}

function same(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function tierScore(tier: MarginTier, providerId: string, service: string) {
  const provider = tier.providerId ? (tier.providerId === providerId ? 2 : -1) : 0;
  const named = tier.service ? (same(tier.service, service) ? 1 : -1) : 0;
  if (provider < 0 || named < 0) return -1;
  return provider + named;
}

export type PriceQuote = {
  price: number;
  purchaseNgn: number;
  percent: number;
  profit: number;
  tierId: string | null;
  reason: "override" | "tier" | "default";
};

export function customerPrice(input: {
  cost: number;
  currency: "NGN" | "USD";
  usdRate: number;
  successRate: number | null;
  pricing: PricingSettings;
  providerId?: string;
  service?: string;
  providerPercent?: number | null;
  defaultPercent: number;
}): PriceQuote {
  const cost = Number(input.cost) || 0;
  const rate = input.currency === "USD" ? (input.usdRate > 0 ? input.usdRate : 0) : 1;
  const purchaseNgn = cost > 0 && rate > 0 ? cost * rate : 0;
  const providerId = input.providerId || "";
  const service = input.service || "";
  const pricing = input.pricing;
  const fallback = input.providerPercent != null && input.providerPercent >= 0 ? input.providerPercent : Math.max(0, input.defaultPercent || 0);
  const override = pricing.overrides.find((row) => row.enabled && (!row.providerId || row.providerId === providerId) && (!row.service || same(row.service, service)) && (row.providerId || row.service));
  let percent = fallback;
  let tierId: string | null = null;
  let reason: PriceQuote["reason"] = "default";
  let minProfit = 0;
  if (override) {
    percent = override.markupPercent;
    minProfit = override.minProfit;
    reason = "override";
  } else if (pricing.auto && input.successRate != null) {
    const ranked = pricing.tiers
      .filter((tier) => tier.enabled)
      .map((tier) => ({ tier, score: tierScore(tier, providerId, service) }))
      .filter((row) => row.score >= 0 && input.successRate != null && input.successRate >= row.tier.minRate && input.successRate <= row.tier.maxRate)
      .sort((a, b) => b.score - a.score || b.tier.minRate - a.tier.minRate);
    const hit = ranked[0]?.tier;
    if (hit) {
      percent = hit.markupPercent;
      minProfit = hit.minProfit;
      tierId = hit.id;
      reason = "tier";
    }
  }
  if (!(purchaseNgn > 0)) return { price: 0, purchaseNgn: 0, percent, profit: 0, tierId, reason };
  let raw = purchaseNgn * (1 + percent / 100);
  if (minProfit > 0) raw = Math.max(raw, purchaseNgn + minProfit);
  const step = pricing.roundTo > 0 ? pricing.roundTo : 1;
  const price = Math.max(0, Math.round(raw / step) * step);
  return { price, purchaseNgn: Math.round(purchaseNgn * 100) / 100, percent, profit: price - purchaseNgn, tierId, reason };
}
