/** FiveSim guest catalogue for Rent numbers. It does not invent a country, service, or price. */

export type RentCountry = { slug: string; name: string; iso: string; prefix: string };
export type RentOffer = { country: string; service: string; operator: string; kind: "activation" | "hosting"; priceUsd: number; stock: number };

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
