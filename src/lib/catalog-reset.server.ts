import { getSql } from "@/lib/db";

export type CatalogReset = { already: boolean; total: number; removed: Record<string, number> };

/** Delete active catalogue rows once. Accounts, wallets, orders, providers, and backups stay. */
export async function clearImportedProducts(): Promise<CatalogReset> {
  const sql = await getSql();
  const marker = await sql<{ note: string }>`select note from shop_catalog_backups where id = 'catalog-cleared'`;
  if (marker[0]) {
    const removed: Record<string, number> = {};
    for (const part of String(marker[0].note || "").split(",").map((item) => item.trim()).filter(Boolean)) {
      const [name, count] = part.split("=");
      if (name && name !== "total") removed[name] = Number(count) || 0;
    }
    const total = Number(String(marker[0].note || "").match(/total=(\d+)/)?.[1] || 0);
    return { already: true, total, removed };
  }
  const rows = await sql.query<{ category: string; n: number }>("select category, count(*) as n from shop_products group by category order by category");
  const removed: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    const n = Number(row.n) || 0;
    removed[row.category || "other"] = n;
    total += n;
  }
  await sql`delete from shop_products`;
  await sql`delete from shop_import_batches`;
  await sql`delete from shop_import_jobs`;
  try {
    await sql`update shop_catalog set doc = '[]' where id = 'main'`;
  } catch {
    // No catalogue blob on this database.
  }
  const note = `total=${total}` + Object.entries(removed).map(([category, count]) => `, ${category}=${count}`).join("");
  await sql`insert into shop_catalog_backups (id, note, products_json, product_count) values ('catalog-cleared', ${note}, '[]', ${total})`;
  return { already: false, total, removed };
}
