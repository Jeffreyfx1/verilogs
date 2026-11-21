/** FiveSim guest catalogue for Rent numbers. It does not invent a country, service, or price. */

export type RentCountry = { slug: string; name: string; iso: string; prefix: string };
export type RentOffer = { country: string; service: string; operator: string; kind: "activation" | "hosting"; priceUsd: number; stock: number; rate?: number | null };

export type RentPricing = { usdNgn: number; marginPerUsd: number; marginEnabled: boolean };

/** Naira charge = provider USD × (Rent Number rate + margin per USD). The margin is skipped when it is off. */
export function rentCharge(priceUsd: number, pricing: RentPricing): number | null {
  const usd = Number(priceUsd);
  const rate = Number(pricing.usdNgn);
  if (!(usd > 0) || !(rate > 0)) return null;
  const margin = pricing.marginEnabled ? Math.max(0, Number(pricing.marginPerUsd) || 0) : 0;
  return Math.round(usd * (rate + margin));
}

export function effectiveRentRate(pricing: RentPricing): number | null {
  const rate = Number(pricing.usdNgn);
  if (!(rate > 0)) return null;
  const margin = pricing.marginEnabled ? Math.max(0, Number(pricing.marginPerUsd) || 0) : 0;
  return rate + margin;
}

export function rentServiceLabel(service: string, label?: string) {
  const custom = String(label || "").trim();
  if (custom) return custom.slice(0, 80);
  return String(service || "").replace(/[_-]+/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/** Operators of one service share a group. A saved label merges only services an admin gave that same name. */
export function rentGroupKey(service: string, label?: string) {
  const custom = String(label || "").trim().toLowerCase();
  if (custom) return `label:${custom.slice(0, 80)}`;
  return `service:${rentSlug(service) || String(service || "").trim().toLowerCase()}`;
}

export type RentVariant = RentOffer & { id: string; label?: string };

/** Highest reported success rate wins. With no rate above zero, the largest stock wins, then the lower USD price. */
export function pickRentVariant(rows: RentVariant[]): RentVariant | null {
  const eligible = rows.filter((row) => row.stock > 0 && row.priceUsd > 0);
  if (!eligible.length) return null;
  const specific = eligible.filter((row) => row.operator !== "any");
  const pool = specific.length ? specific : eligible;
  const rated = pool.filter((row) => (row.rate || 0) > 0);
  const ranked = (rated.length ? rated : pool).slice().sort((a, b) => {
    if (rated.length && (b.rate || 0) !== (a.rate || 0)) return (b.rate || 0) - (a.rate || 0);
    if (!rated.length && b.stock !== a.stock) return b.stock - a.stock;
    if (a.priceUsd !== b.priceUsd) return a.priceUsd - b.priceUsd;
    return b.stock - a.stock;
  });
  return ranked[0] || null;
}

export function groupRentOffers(rows: RentVariant[]) {
  const groups = new Map<string, RentVariant[]>();
  for (const row of rows) {
    const key = rentGroupKey(row.service, row.label);
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  const out: { key: string; label: string; chosen: RentVariant; variants: number }[] = [];
  for (const [key, list] of groups) {
    const chosen = pickRentVariant(list);
    if (!chosen) continue;
    const named = list.find((row) => String(row.label || "").trim());
    out.push({ key, label: rentServiceLabel(chosen.service, named?.label), chosen, variants: list.length });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export function rentSearchHit(name: string, query: string) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  return String(name || "").toLowerCase().includes(q);
}

export function flagEmoji(iso: string) {
  const code = String(iso || "").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...code.split("").map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 97));
}

export function parseFiveSimOperatorPrices(body: unknown, country: string): RentOffer[] {
  const place = rentSlug(country);
  if (!place || !body || typeof body !== "object" || Array.isArray(body)) return [];
  const root = body as Record<string, unknown>;
  const nested = root[place];
  const bucket = nested && typeof nested === "object" && !Array.isArray(nested) ? nested as Record<string, unknown> : root;
  const out: RentOffer[] = [];
  for (const [service, ops] of Object.entries(bucket)) {
    const name = rentSlug(service);
    if (!name || !ops || typeof ops !== "object" || Array.isArray(ops)) continue;
    const rec = ops as Record<string, unknown>;
    if ("Price" in rec || "Category" in rec || "cost" in rec) continue;
    for (const [operator, info] of Object.entries(rec)) {
      const who = rentSlug(operator);
      const row = info && typeof info === "object" ? info as Record<string, unknown> : null;
      if (!who || !row || !("cost" in row)) continue;
      const price = Number(row.cost);
      const stock = Math.max(0, Math.round(Number(row.count) || 0));
      const rate = Number(row.rate);
      if (!(price > 0)) continue;
      out.push({ country: place, service: name, operator: who, kind: "activation", priceUsd: price, stock, rate: rate > 0 ? rate : null });
    }
  }
  return out;
}

const SLUG = /^[a-z0-9][a-z0-9._-]{0,60}$/;

export function rentSlug(value: string) {
  const slug = String(value || "").trim().toLowerCase();
  return SLUG.test(slug) ? slug : "";
}

export function parseFiveSimCountries(body: unknown): RentCountry[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const out: RentCountry[] = [];
  for (const [slug, info] of Object.entries(body as Record<string, unknown>)) {
    const safe = rentSlug(slug);
    const row = info && typeof info === "object" ? info as Record<string, unknown> : null;
    if (!safe || !row) continue;
    const name = String(row.text_en || "").trim();
    if (!name) continue;
    const iso = row.iso && typeof row.iso === "object" ? Object.keys(row.iso as object)[0] || "" : "";
    const prefix = row.prefix && typeof row.prefix === "object" ? Object.keys(row.prefix as object)[0] || "" : "";
    out.push({ slug: safe, name, iso: iso.slice(0, 8), prefix: prefix.slice(0, 8) });
  }
  return out;
}

export function parseFiveSimProducts(body: unknown, country: string, operator = "any"): RentOffer[] {
  const place = rentSlug(country);
  const who = rentSlug(operator);
  if (!place || !who || !body || typeof body !== "object" || Array.isArray(body)) return [];
  const out: RentOffer[] = [];
  for (const [service, info] of Object.entries(body as Record<string, unknown>)) {
    const name = rentSlug(service);
    const row = info && typeof info === "object" ? info as Record<string, unknown> : null;
    if (!name || !row) continue;
    const kind = String(row.Category || row.category || "").toLowerCase();
    if (kind !== "activation" && kind !== "hosting") continue;
    const price = Number(row.Price ?? row.price);
    const stock = Math.round(Number(row.Qty ?? row.count ?? row.quantity) || 0);
    if (!(price > 0) || stock <= 0) continue;
    out.push({ country: place, service: name, operator: who, kind, priceUsd: price, stock });
  }
  return out;
}

export function fiveSimBuyUrl(offer: Pick<RentOffer, "kind" | "country" | "operator" | "service">) {
  const mode = offer.kind === "hosting" ? "hosting" : "activation";
  return `https://5sim.net/v1/user/buy/${mode}/${offer.country}/${offer.operator}/${offer.service}`;
}
