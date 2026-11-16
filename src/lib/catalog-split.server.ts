import type { Data, Product } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { upsertProductRows } from "@/lib/product-rows.server";

let verified = false;

export function catalogSplitVerified() {
  return verified;
}

export type SplitResult = { ok: boolean; clear: boolean; products: number; error: string | null };

function asProduct(value: unknown): Product | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Product;
  if (!row.id && !row.externalId) return null;
  const externalId = String(row.externalId || row.id || "");
  const providerId = String(row.providerId || "legacy");
  return { ...row, providerId, externalId };
}

/** Copy shop_state / shop_catalog products into shop_products. Originals stay until counts match. */
export async function ensureCatalogSplit(doc: Data): Promise<SplitResult> {
  const sql = await getSql();
  const marker = await sql<{ id: string }>`select id from shop_catalog_backups where id = 'split-verified'`;
  const embedded = Array.isArray(doc.products) ? doc.products : [];
  if (marker[0] && embedded.length === 0) {
    verified = true;
    return { ok: true, clear: false, products: 0, error: null };
  }
  if (marker[0] && embedded.length > 0) {
    verified = true;
    return { ok: true, clear: true, products: embedded.length, error: null };
  }

  let blob: Product[] = [];
  try {
    const rows = await sql<{ doc: string }>`select doc from shop_catalog where id = 'main'`;
    if (rows[0]?.doc && rows[0].doc !== "[]") {
      const parsed = JSON.parse(rows[0].doc) as unknown;
      if (Array.isArray(parsed)) blob = parsed.map(asProduct).filter((row): row is Product => !!row);
    }
  } catch {
    blob = [];
  }

  const stateProducts = embedded.map(asProduct).filter((row): row is Product => !!row);
  if (!stateProducts.length && !blob.length) {
    await sql`insert into shop_catalog_backups (id, note, products_json, product_count) values ('split-verified', 'no embedded catalogue', '[]', 0) on conflict (id) do nothing`;
    verified = true;
    return { ok: true, clear: embedded.length > 0, products: 0, error: null };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const note = `users=${doc.users.length} orders=${doc.orders.length} txns=${doc.txns.length} announcements=${(doc.announcements || []).length} providers=${doc.providers.length} products=${stateProducts.length}`;
  await sql`insert into shop_catalog_backups (id, note, products_json, product_count) values (${"state-doc-" + stamp}, ${note}, ${JSON.stringify(doc)}, ${stateProducts.length})`;
  if (blob.length) {
    await sql`insert into shop_catalog_backups (id, note, products_json, product_count) values (${"catalog-blob-" + stamp}, ${"shop_catalog blob kept after copy"}, ${JSON.stringify(blob)}, ${blob.length})`;
  }

  const merged = new Map<string, Product>();
  for (const product of blob) merged.set(`${product.providerId}|${product.externalId}`, product);
  for (const product of stateProducts) merged.set(`${product.providerId}|${product.externalId}`, product);
  const all = [...merged.values()];
  await upsertProductRows(all, "split-" + stamp);

  let matched = 0;
  const byProvider = new Map<string, string[]>();
  for (const product of all) {
    const list = byProvider.get(product.providerId) || [];
    list.push(product.externalId);
    byProvider.set(product.providerId, list);
  }
  for (const [providerId, ids] of byProvider) {
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500);
      const rows = await sql.query<{ n: number }>(
        "select count(*) as n from shop_products where provider_id = $1 and external_id = any($2::text[])",
        [providerId, slice],
      );
      matched += Number(rows[0]?.n) || 0;
    }
  }
  if (matched < all.length) {
    return {
      ok: false,
      clear: false,
      products: all.length,
      error: `Catalogue split stopped: ${matched} of ${all.length} products are in shop_products. shop_state was not cleared.`,
    };
  }

  await sql`insert into shop_catalog_backups (id, note, products_json, product_count) values ('split-verified', ${note}, '[]', ${all.length}) on conflict (id) do update set note = excluded.note, product_count = excluded.product_count, taken_at = now()`;
  verified = true;
  return { ok: true, clear: true, products: all.length, error: null };
}
