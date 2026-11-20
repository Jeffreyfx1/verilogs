import { getSql } from "@/lib/db";
import { uid } from "@/lib/money";
import type { DiscoveryReport, LogoMatch } from "@/lib/logo-discover";

export type StoredLogo = {
  category: string;
  imageUrl: string;
  page: string;
  filename: string;
  format: string;
  confidence: number;
  custom: boolean;
  verified: boolean;
  note: string;
};

export async function categoryUsage() {
  const sql = await getSql();
  const rows = await sql.query<{ name: string; services: string; custom_images: string }>(
    `select marketplace_subcategory as name,
            count(*)::text as services,
            count(*) filter (where coalesce(image_url, '') <> '')::text as custom_images
     from shop_products
     where category in ('logs', 'smm', 'vpn') and marketplace_subcategory <> ''
     group by marketplace_subcategory
     order by marketplace_subcategory`,
  );
  return rows.map((row) => ({ name: row.name, services: Number(row.services) || 0, customImages: Number(row.custom_images) || 0 }));
}

export async function listStoredLogos() {
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>("select * from shop_category_logos order by category_name");
  return rows.map((row) => ({
    category: String(row.category_name || ""),
    imageUrl: String(row.image_url || ""),
    page: String(row.source_page || ""),
    filename: String(row.filename || ""),
    format: String(row.format || ""),
    confidence: Number(row.confidence) || 0,
    custom: !!row.custom,
    verified: !!row.verified,
    note: String(row.note || ""),
  })) satisfies StoredLogo[];
}

export async function logoMap() {
  const rows = await listStoredLogos();
  const out: Record<string, string> = {};
  for (const row of rows) if (row.imageUrl) out[row.category] = row.imageUrl;
  return out;
}

export async function saveDiscovery(report: DiscoveryReport, matches: LogoMatch[]) {
  const sql = await getSql();
  const id = uid("logo");
  const high = matches.filter((item) => item.status === "high").length;
  const ambiguous = matches.filter((item) => item.status === "ambiguous").length;
  await sql.query(
    `insert into shop_logo_discoveries (id, source_site, report_json, category_count, logo_count, listing_count, matched, ambiguous, imported, errors)
     values ($1, 'accszone.com', $2, $3, $4, $5, $6, $7, 0, $8)`,
    [id, JSON.stringify({ report, matches }), report.categories.length, report.categories.length, report.listings.length, high, ambiguous, report.errors.join("\n").slice(0, 2000)],
  );
  return id;
}

export async function latestDiscovery() {
  const sql = await getSql();
  const rows = await sql.query<{ report_json: string; created_at: string; errors: string }>(
    "select report_json, created_at::text, errors from shop_logo_discoveries order by created_at desc limit 1",
  );
  if (!rows[0]) return null;
  try {
    const parsed = JSON.parse(rows[0].report_json) as { report: DiscoveryReport; matches: LogoMatch[] };
    return { ...parsed, createdAt: rows[0].created_at, errors: rows[0].errors };
  } catch {
    return null;
  }
}

export async function saveCategoryLogo(input: { category: string; imageUrl: string; page: string; filename: string; format: string; confidence: number; custom: boolean; verified: boolean; note: string; replace: boolean; sourceSite?: string }) {
  const sql = await getSql();
  const current = await sql.query<{ custom: boolean }>("select custom from shop_category_logos where category_name = $1", [input.category]);
  if (current[0]?.custom && !input.replace) return { saved: false, reason: "This category has an approved logo. Confirm replace to change it." };
  const sourceSite = (input.sourceSite || "accszone.com").slice(0, 80);
  await sql.query(
    `insert into shop_category_logos (category_name, image_url, source_page, source_site, filename, format, confidence, status, custom, verified, note, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, 'imported', $8, $9, $10, now())
     on conflict (category_name) do update set
       image_url = excluded.image_url,
       source_page = excluded.source_page,
       source_site = excluded.source_site,
       filename = excluded.filename,
       format = excluded.format,
       confidence = excluded.confidence,
       custom = excluded.custom,
       verified = excluded.verified,
       note = excluded.note,
       updated_at = now()`,
    [input.category, input.imageUrl, input.page, sourceSite, input.filename, input.format, input.confidence, input.custom, input.verified, input.note.slice(0, 300)],
  );
  return { saved: true, reason: "" };
}

export async function servicesCovered(categories: string[]) {
  if (!categories.length) return 0;
  const sql = await getSql();
  const rows = await sql.query<{ count: string }>(
    `select count(*)::text as count from shop_products
     where category in ('logs', 'smm', 'vpn') and marketplace_subcategory = any($1::text[]) and coalesce(image_url, '') = ''`,
    [categories],
  );
  return Number(rows[0]?.count) || 0;
}
