import { getSql } from "@/lib/db";
import { uid } from "@/lib/money";
import { parseFiveSimCountries, parseFiveSimProducts, rentSlug, type RentOffer } from "@/lib/rent";

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
    const id = `${offer.country}|${offer.service}|${offer.operator}|${offer.kind}`;
    const existing = await sql.query<{ id: string }>("select id from shop_rent_offers where country = $1 and service = $2 and operator = $3 and kind = $4", [offer.country, offer.service, offer.operator, offer.kind]);
    if (existing[0]) {
      await sql.query("update shop_rent_offers set price_usd = $2, stock = $3, updated_at = $4 where id = $1", [existing[0].id, String(offer.priceUsd), offer.stock, now]);
      updated += 1;
    } else {
      await sql.query(
        "insert into shop_rent_offers (id, country, service, operator, kind, price_usd, stock, updated_at) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [id, offer.country, offer.service, offer.operator, offer.kind, String(offer.priceUsd), offer.stock, now],
      );
      imported += 1;
    }
  }
  const skipped = Math.max(0, seen - offers.length);
  await logImport("services", { imported, updated, skipped, failed: 0 }, `${slug}: ${offers.length} stocked`);
  return { error: null as string | null, imported, updated, skipped };
}

export async function readRentOffer(id: string): Promise<RentOffer | null> {
  const sql = await getSql();
  const rows = await sql.query<{ country: string; service: string; operator: string; kind: string; price_usd: string; stock: number }>(
    "select country, service, operator, kind, price_usd, stock from shop_rent_offers where id = $1",
    [id.slice(0, 180)],
  );
  const row = rows[0];
  if (!row || (row.kind !== "activation" && row.kind !== "hosting")) return null;
  const price = Number(row.price_usd);
  if (!(price > 0) || row.stock <= 0) return null;
  return { country: row.country, service: row.service, operator: row.operator, kind: row.kind, priceUsd: price, stock: row.stock };
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
  return sql.query<{ slug: string; name: string }>(
    "select c.slug, c.name from shop_rent_countries c where exists (select 1 from shop_rent_offers o where o.country = c.slug and o.stock > 0) order by c.name",
  );
}

export async function rentServices(country: string) {
  const slug = rentSlug(country);
  if (!slug) return [];
  const sql = await getSql();
  return sql.query<{ id: string; service: string; operator: string; kind: string; price_usd: string; stock: number }>(
    "select id, service, operator, kind, price_usd, stock from shop_rent_offers where country = $1 and stock > 0 order by service",
    [slug],
  );
}
