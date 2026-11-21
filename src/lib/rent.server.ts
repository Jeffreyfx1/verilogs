import { getSql } from "@/lib/db";
import { uid } from "@/lib/money";
import { groupRentOffers, parseFiveSimCountries, parseFiveSimOperatorPrices, parseFiveSimProducts, rentSlug, type RentOffer, type RentPricing, type RentVariant } from "@/lib/rent";

const GUEST = "https://5sim.net/v1/guest";

async function guest(path: string) {
  const res = await fetch(GUEST + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json && typeof json === "object" ? String((json as { message?: unknown }).message || "") : "";
    throw new Error(message.slice(0, 160) || `FiveSim returned ${res.status}.`);
  }
  return json;
}

async function logImport(action: string, counts: { imported: number; updated: number; skipped: number; failed: number }, detail: string) {
  const sql = await getSql();
  await sql.query(
    "insert into shop_rent_imports (id, action, imported, updated, skipped, failed, detail, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8)",
    [uid("imp"), action.slice(0, 40), counts.imported, counts.updated, counts.skipped, counts.failed, detail.slice(0, 240), new Date().toISOString()],
  );
}

export async function importRentCountries() {
  let body: unknown;
  try {
    body = await guest("/countries");
  } catch (err) {
    const message = err instanceof Error ? err.message : "FiveSim could not be reached.";
    await logImport("countries", { imported: 0, updated: 0, skipped: 0, failed: 1 }, message);
    return { error: message, imported: 0, updated: 0 };
  }
  const rows = parseFiveSimCountries(body);
  const sql = await getSql();
  const now = new Date().toISOString();
  let imported = 0;
  let updated = 0;
  for (const row of rows) {
    const existing = await sql.query<{ slug: string }>("select slug from shop_rent_countries where slug = $1", [row.slug]);
    if (existing[0]) {
      await sql.query("update shop_rent_countries set name = $2, iso = $3, prefix = $4, updated_at = $5 where slug = $1", [row.slug, row.name, row.iso, row.prefix, now]);
      updated += 1;
    } else {
      await sql.query("insert into shop_rent_countries (slug, name, iso, prefix, updated_at) values ($1,$2,$3,$4,$5)", [row.slug, row.name, row.iso, row.prefix, now]);
      imported += 1;
    }
  }
  await logImport("countries", { imported, updated, skipped: 0, failed: 0 }, `${rows.length} countries from FiveSim`);
  return { error: null as string | null, imported, updated };
}

export async function importRentServices(country: string) {
  const slug = rentSlug(country);
  if (!slug) return { error: "Choose a country FiveSim returned.", imported: 0, updated: 0, skipped: 0 };
  let body: unknown;
  try {
    body = await guest(`/products/${slug}/any`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "FiveSim could not be reached.";
    await logImport("services", { imported: 0, updated: 0, skipped: 0, failed: 1 }, `${slug}: ${message}`);
    return { error: message, imported: 0, updated: 0, skipped: 0 };
  }
  const offers = parseFiveSimProducts(body, slug, "any");
  const seen = body && typeof body === "object" ? Object.keys(body as object).length : 0;
  const sql = await getSql();
  const now = new Date().toISOString();
  let imported = 0;
  let updated = 0;
  for (const offer of offers) {
    const saved = await upsertRentOffer(sql, offer, now);
    if (saved === "new") imported += 1;
    else updated += 1;
  }
  let operatorNote = "";
  try {
    const prices = await guest(`/prices?country=${encodeURIComponent(slug)}`);
    const variants = parseFiveSimOperatorPrices(prices, slug).filter((row) => row.stock > 0);
    const kept = new Set<string>();
    for (const offer of variants) {
      const saved = await upsertRentOffer(sql, offer, now);
      kept.add(rentOfferId(offer));
      if (saved === "new") imported += 1;
      else updated += 1;
    }
    if (kept.size) {
      const previous = await sql.query<{ id: string }>("select id from shop_rent_offers where country = $1 and operator <> 'any'", [slug]);
      for (const row of previous) {
        if (kept.has(row.id)) continue;
        await sql.query("update shop_rent_offers set stock = 0, updated_at = $2 where id = $1", [row.id, now]);
      }
    }
    operatorNote = ` · ${variants.length} operator variants`;
  } catch {
    operatorNote = " · operator prices were not changed";
  }
  const skipped = Math.max(0, seen - offers.length);
  await logImport("services", { imported, updated, skipped, failed: 0 }, `${slug}: ${offers.length} stocked${operatorNote}`);
  return { error: null as string | null, imported, updated, skipped };
}

export async function readRentOffer(id: string): Promise<(RentOffer & { id: string }) | null> {
  const sql = await getSql();
  const rows = await sql.query<{ id: string; country: string; service: string; operator: string; kind: string; price_usd: string; stock: number; rate: string }>(
    "select id, country, service, operator, kind, price_usd, stock, rate from shop_rent_offers where id = $1",
    [id.slice(0, 180)],
  );
  return offerFromRow(rows[0]);
}

function rentOfferId(offer: Pick<RentOffer, "country" | "service" | "operator" | "kind">) {
  return `${offer.country}|${offer.service}|${offer.operator}|${offer.kind}`;
}

function offerFromRow(row?: { id: string; country?: string; service: string; operator: string; kind: string; price_usd: string; stock: number; rate?: string }): RentVariant | null {
  if (!row || (row.kind !== "activation" && row.kind !== "hosting")) return null;
  const price = Number(row.price_usd);
  const rate = Number(row.rate);
  if (!(price > 0)) return null;
  return {
    id: row.id,
    country: row.country || "",
    service: row.service,
    operator: row.operator,
    kind: row.kind,
    priceUsd: price,
    stock: Number(row.stock) || 0,
    rate: rate > 0 ? rate : null,
  };
}

async function upsertRentOffer(sql: Awaited<ReturnType<typeof getSql>>, offer: RentOffer, now: string) {
  const id = rentOfferId(offer);
  const rate = offer.rate && offer.rate > 0 ? String(offer.rate) : "";
  const existing = await sql.query<{ id: string }>("select id from shop_rent_offers where country = $1 and service = $2 and operator = $3 and kind = $4", [offer.country, offer.service, offer.operator, offer.kind]);
  if (existing[0]) {
    await sql.query("update shop_rent_offers set price_usd = $2, stock = $3, rate = $4, updated_at = $5 where id = $1", [existing[0].id, String(offer.priceUsd), offer.stock, rate, now]);
    return "updated" as const;
  }
  await sql.query(
    "insert into shop_rent_offers (id, country, service, operator, kind, price_usd, stock, rate, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [id, offer.country, offer.service, offer.operator, offer.kind, String(offer.priceUsd), offer.stock, rate, now],
  );
  return "new" as const;
}

export async function readRentPricing(): Promise<RentPricing> {
  const sql = await getSql();
  const rows = await sql.query<{ usd_ngn: string; margin_per_usd: string; margin_enabled: number }>(
    "select usd_ngn, margin_per_usd, margin_enabled from shop_rent_pricing where id = 'default'",
  );
  return {
    usdNgn: Number(rows[0]?.usd_ngn) || 0,
    marginPerUsd: Number(rows[0]?.margin_per_usd) || 0,
    marginEnabled: Number(rows[0]?.margin_enabled) === 1,
  };
}

export async function saveRentPricing(input: RentPricing) {
  const usdNgn = Math.round(Number(input.usdNgn) * 100) / 100;
  const marginPerUsd = Math.round(Number(input.marginPerUsd) * 100) / 100;
  if (!(usdNgn > 0) || usdNgn > 1_000_000) return { error: "Enter a Rent Number exchange rate above zero." };
  if (!(marginPerUsd >= 0) || marginPerUsd > 1_000_000) return { error: "Margin per USD cannot be negative." };
  const sql = await getSql();
  const now = new Date().toISOString();
  const current = await sql.query<{ id: string }>("select id from shop_rent_pricing where id = 'default'");
  if (current[0]) {
    await sql.query("update shop_rent_pricing set usd_ngn = $2, margin_per_usd = $3, margin_enabled = $4, updated_at = $5 where id = $1", ["default", String(usdNgn), String(marginPerUsd), input.marginEnabled ? 1 : 0, now]);
  } else {
    await sql.query("insert into shop_rent_pricing (id, usd_ngn, margin_per_usd, margin_enabled, updated_at) values ('default',$1,$2,$3,$4)", [String(usdNgn), String(marginPerUsd), input.marginEnabled ? 1 : 0, now]);
  }
  return { error: null as string | null };
}

export async function saveRentLabel(service: string, label: string) {
  const slug = rentSlug(service);
  if (!slug) return { error: "That service was not found." };
  const sql = await getSql();
  const known = await sql.query<{ service: string }>("select service from shop_rent_offers where service = $1 limit 1", [slug]);
  if (!known[0]) return { error: "That service is not in the Rent Number catalogue." };
  const clean = String(label || "").trim().slice(0, 80);
  if (!clean) {
    await sql.query("delete from shop_rent_labels where service = $1", [slug]);
    return { error: null as string | null };
  }
  const now = new Date().toISOString();
  const current = await sql.query<{ service: string }>("select service from shop_rent_labels where service = $1", [slug]);
  if (current[0]) await sql.query("update shop_rent_labels set label = $2, updated_at = $3 where service = $1", [slug, clean, now]);
  else await sql.query("insert into shop_rent_labels (service, label, updated_at) values ($1,$2,$3)", [slug, clean, now]);
  return { error: null as string | null };
}

export async function searchRentCatalogue(query: string) {
  const q = String(query || "").trim().toLowerCase().replace(/[%_]/g, "").slice(0, 40);
  if (!q) return [];
  const sql = await getSql();
  return sql.query<{ service: string; label: string; variants: number }>(
    `select o.service, coalesce(max(l.label), '') as label, count(*) as variants
     from shop_rent_offers o
     left join shop_rent_labels l on l.service = o.service
     where o.service like $1 or lower(coalesce(l.label, '')) like $1
     group by o.service
     order by o.service`,
    [`%${q}%`],
  );
}

export async function rentDesk() {
  const sql = await getSql();
  const countries = await sql.query<{ slug: string; name: string; iso: string; prefix: string }>("select slug, name, iso, prefix from shop_rent_countries order by name");
  const counts = await sql.query<{ country: string; kind: string; n: string | number }>("select country, kind, count(*) as n from shop_rent_offers group by country, kind");
  const imports = await sql.query<{ id: string; action: string; imported: number; updated: number; skipped: number; failed: number; detail: string; created_at: string }>(
    "select id, action, imported, updated, skipped, failed, detail, created_at from shop_rent_imports order by created_at desc limit 20",
  );
  const stocked = new Map<string, { activation: number; hosting: number }>();
  for (const row of counts) {
    const current = stocked.get(row.country) || { activation: 0, hosting: 0 };
    if (row.kind === "hosting") current.hosting = Number(row.n) || 0;
    else current.activation = Number(row.n) || 0;
    stocked.set(row.country, current);
  }
  return {
    countries: countries.map((row) => ({ ...row, ...(stocked.get(row.slug) || { activation: 0, hosting: 0 }) })),
    offers: counts.reduce((sum, row) => sum + (Number(row.n) || 0), 0),
    imports,
    pricing: await readRentPricing(),
  };
}

export async function rentCountryName(slug: string) {
  const safe = rentSlug(slug);
  if (!safe) return "";
  const sql = await getSql();
  const rows = await sql.query<{ name: string }>("select name from shop_rent_countries where slug = $1", [safe]);
  return String(rows[0]?.name || "");
}

export async function rentCountries() {
  const sql = await getSql();
  return sql.query<{ slug: string; name: string; iso: string }>(
    "select c.slug, c.name, c.iso from shop_rent_countries c where exists (select 1 from shop_rent_offers o where o.country = c.slug and o.stock > 0) order by c.name",
  );
}

export async function rentGroups(country: string) {
  const slug = rentSlug(country);
  if (!slug) return [];
  const sql = await getSql();
  const rows = await sql.query<{ id: string; service: string; operator: string; kind: string; price_usd: string; stock: number; rate: string; label: string }>(
    `select o.id, o.service, o.operator, o.kind, o.price_usd, o.stock, o.rate, coalesce(l.label, '') as label
     from shop_rent_offers o
     left join shop_rent_labels l on l.service = o.service
     where o.country = $1 and o.stock > 0`,
    [slug],
  );
  const variants: RentVariant[] = [];
  for (const row of rows) {
    const offer = offerFromRow(row);
    if (!offer || offer.stock <= 0) continue;
    variants.push({ ...offer, label: row.label });
  }
  return groupRentOffers(variants);
}

export async function rentVariantRows(country: string, service: string) {
  const slug = rentSlug(country);
  const name = rentSlug(service);
  if (!slug || !name) return [];
  const sql = await getSql();
  const rows = await sql.query<{ id: string; service: string; operator: string; kind: string; price_usd: string; stock: number; rate: string }>(
    "select id, service, operator, kind, price_usd, stock, rate from shop_rent_offers where country = $1 and service = $2 order by operator",
    [slug, name],
  );
  return rows.flatMap((row) => {
    const offer = offerFromRow(row);
    return offer ? [offer] : [];
  });
}
