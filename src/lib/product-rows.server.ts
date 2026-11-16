import type { Product } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { SHELF_CATEGORIES, shelfOf } from "@/lib/shelves";

const COLS = 21;

function rowOf(row: Record<string, unknown>): Product {
  return {
    id: String(row.id || ""),
    providerId: String(row.provider_id || ""),
    externalId: String(row.external_id || ""),
    category: (row.category as Product["category"]) || "other",
    name: String(row.name || ""),
    service: String(row.service || ""),
    country: String(row.country || ""),
    network: String(row.network || ""),
    price: Number(row.price) || 0,
    cost: Number(row.cost) || 0,
    stock: Number(row.stock) || 0,
    operator: String(row.operator || ""),
    rate: Number(row.rate) || 0,
    rates: String(row.rates || ""),
    enabled: !!row.enabled,
    validity: String(row.validity || ""),
    variable: !!row.variable,
    description: String(row.description || ""),
    importType: String(row.import_type || ""),
    serverId: String(row.server_id || ""),
  };
}

export async function upsertProductRows(products: Product[], sync: string) {
  const sql = await getSql();
  const size = 200;
  for (let i = 0; i < products.length; i += size) {
    const chunk = products.slice(i, i + size);
    const values: unknown[] = [];
    const groups = chunk.map((product, index) => {
      const at = index * COLS;
      values.push(
        product.id,
        product.providerId,
        product.externalId,
        product.category,
        product.name,
        product.service,
        product.country,
        product.network,
        Math.round(Number(product.price) || 0),
        Number(product.cost) || 0,
        Math.round(Number(product.stock) || 0),
        product.operator,
        Math.round(Number(product.rate) || 0),
        product.rates,
        product.enabled,
        product.validity,
        product.variable,
        product.description,
        product.importType || "",
        product.serverId || "",
        sync,
      );
      return `(${Array.from({ length: COLS }, (_, n) => `$${at + n + 1}`).join(",")})`;
    });
    await sql.query(
      `insert into shop_products (id, provider_id, external_id, category, name, service, country, network, price, cost, stock, operator, rate, rates, enabled, validity, variable, description, import_type, server_id, sync)
       values ${groups.join(",")}
       on conflict (provider_id, external_id) do update set
         name = excluded.name, service = excluded.service, country = excluded.country, network = excluded.network,
         cost = excluded.cost, stock = excluded.stock, operator = excluded.operator,
         rate = excluded.rate, rates = excluded.rates, category = excluded.category,
         import_type = excluded.import_type, server_id = excluded.server_id, validity = excluded.validity,
         variable = case when shop_products.price_locked then shop_products.variable else excluded.variable end,
         description = case when shop_products.description_locked then shop_products.description else excluded.description end,
         price = case when shop_products.price_locked then shop_products.price else excluded.price end,
         sync = excluded.sync`,
      values,
    );
  }
}

export async function countExistingProducts(providerId: string, externalIds: string[]) {
  if (!externalIds.length) return 0;
  const sql = await getSql();
  const rows = await sql.query<{ n: number }>(
    "select count(*) as n from shop_products where provider_id = $1 and external_id = any($2::text[])",
    [providerId, externalIds],
  );
  return Number(rows[0]?.n) || 0;
}

export async function pruneSyncedProducts(providerId: string, sync: string, touched: string[], categories: string[] = ["numbers", "rent"]) {
  const sql = await getSql();
  const cats = [...new Set(categories.filter(Boolean))];
  const heavy = cats.filter((category) => category === "numbers" || category === "rent" || category === "number" || category === "usa");
  const rest = cats.filter((category) => category !== "numbers" && category !== "rent");
  if (heavy.length && touched.length) {
    const size = 500;
    for (let i = 0; i < touched.length; i += size) {
      const keys = touched.slice(i, i + size);
      await sql.query(
        `delete from shop_products
         where provider_id = $1 and category = any($2::text[]) and sync <> $3
           and (country || '|' || service) = any($4::text[])`,
        [providerId, heavy, sync, keys],
      );
    }
  }
  if (rest.length) {
    await sql.query(
      `delete from shop_products where provider_id = $1 and category = any($2::text[]) and sync <> $3`,
      [providerId, rest, sync],
    );
  }
}

export async function dropMisfiledBoost(_providerId?: string) {
  return;
}

export async function readShopRows(categories: string[], limit = 2000) {
  if (!categories.length) return [];
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    "select * from shop_products where category = any($1::text[]) order by service, name limit $2",
    [categories, limit],
  );
  return rows.map(rowOf);
}

export async function queryExtras(input: { q?: string; providerIds: string[]; kind?: "vpn" | "smm" | "random" | "shop"; page?: number }) {
  if (!input.providerIds.length) return { rows: [], more: false };
  const sql = await getSql();
  const shelf = shelfOf(input.kind === "shop" ? "random" : input.kind);
  const values: unknown[] = [input.providerIds, [...SHELF_CATEGORIES[shelf]]];
  const parts = ["enabled = true", "provider_id = any($1::text[])", "category = any($2::text[])"];
  if (input.q) {
    values.push(`%${input.q.replace(/[%_]/g, "")}%`);
    parts.push(`(name ilike $${values.length} or service ilike $${values.length} or description ilike $${values.length} or category ilike $${values.length})`);
  }
  const page = Math.max(0, Math.min(5000, Math.floor(Number(input.page) || 0)));
  const limit = 40;
  values.push(limit + 1, page * limit);
  const rows = await sql.query<Record<string, unknown>>(
    `select * from shop_products where ${parts.join(" and ")} order by service, name limit $${values.length - 1} offset $${values.length}`,
    values,
  );
  const more = rows.length > limit;
  return { rows: rows.slice(0, limit).map(rowOf), more };
}

export async function readProduct(id: string) {
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>("select * from shop_products where id = $1", [id]);
  return rows[0] ? rowOf(rows[0]) : null;
}

export async function setRowsEnabled(ids: string[], enabled: boolean) {
  if (!ids.length) return;
  const sql = await getSql();
  await sql.query("update shop_products set enabled = $1 where id = any($2::text[])", [enabled, ids]);
}

export async function lockListing(id: string, patch: { description: string; price: number }) {
  const sql = await getSql();
  const price = Math.round(Number(patch.price) || 0);
  await sql.query(
    `update shop_products
     set description = $2,
         description_locked = true,
         price = case when $3 > 0 then $3 else price end,
         price_locked = true,
         variable = case when $3 > 0 then false else variable end
     where id = $1`,
    [id, patch.description, price],
  );
}

export async function providerIdsWithNumbers() {
  const sql = await getSql();
  const rows = await sql<{ provider_id: string }>`select distinct provider_id from shop_products where category in ('number','numbers','rent')`;
  return rows.map((row) => row.provider_id);
}

export async function clearProducts() {
  const sql = await getSql();
  await sql`delete from shop_products`;
}

type BrowseInput = { providerId?: string; category?: string; country?: string; service?: string; q?: string; detail?: boolean; admin?: boolean; enabledProviderIds?: string[]; serverId?: string };

function filters(input: BrowseInput, values: unknown[]) {
  const category = input.category === "usa" ? "usa" : input.category === "rent" ? "rent" : input.category === "numbers" ? "number" : input.category || "number";
  const parts = ["category = $1"];
  values.push(category);
  if (category === "number" || category === "rent") {
    parts.push("country <> ''", "country <> 'Any'");
  }
  if (category === "number" && input.serverId) {
    values.push(input.serverId);
    parts.push(`server_id = $${values.length}`);
  }
  if (input.providerId) {
    values.push(input.providerId);
    parts.push(`provider_id = $${values.length}`);
  } else if (!input.admin && input.enabledProviderIds) {
    values.push(input.enabledProviderIds);
    parts.push(`provider_id = any($${values.length}::text[])`);
  }
  if (!input.admin) parts.push("enabled = true");
  if (input.country) {
    values.push(input.country);
    parts.push(`country = $${values.length}`);
  }
  if (input.service) {
    values.push(input.service);
    parts.push(`service = $${values.length}`);
  }
  if (input.q) {
    values.push(`%${input.q.replace(/[%_]/g, "")}%`);
    parts.push(`service ilike $${values.length}`);
  }
  return parts.join(" and ");
}

export async function queryServices(input: BrowseInput) {
  const sql = await getSql();
  const values: unknown[] = [];
  const where = filters(input, values);
  const rows = await sql.query<{ service: string; provider_id: string; cost: number; price: number }>(
    `select service, provider_id, min(cost) as cost, min(price) as price from shop_products where ${where} group by service, provider_id order by service limit 400`,
    values,
  );
  return rows.map((row) => ({ service: row.service, providerId: row.provider_id, cost: Number(row.cost) || 0, price: Number(row.price) || 0 }));
}

export async function queryCountries(input: BrowseInput) {
  const sql = await getSql();
  const values: unknown[] = [];
  const where = filters(input, values);
  const rows = await sql.query<Record<string, unknown>>(
    `select distinct on (country) * from shop_products where ${where} order by country, price asc`,
    values,
  );
  return rows.map(rowOf).sort((a, b) => a.price - b.price || a.country.localeCompare(b.country));
}

export async function queryOperators(input: BrowseInput) {
  const sql = await getSql();
  const values: unknown[] = [];
  const where = filters(input, values);
  const rows = await sql.query<Record<string, unknown>>(
    `select * from shop_products where ${where} order by rate desc, price asc, operator asc`,
    values,
  );
  return rows.map(rowOf);
}

export async function queryHidden(providerId: string, category: string) {
  const sql = await getSql();
  const rows = await sql.query<{ n: number }>(
    "select count(*) as n from shop_products where category = $1 and enabled = false and ($2 = '' or provider_id = $2)",
    [category, providerId],
  );
  return Number(rows[0]?.n) || 0;
}

export async function queryCatalogPage(input: { q?: string; category?: string; providerId?: string; only?: string; page?: number }) {
  const sql = await getSql();
  const values: unknown[] = [];
  const parts: string[] = [];
  if (input.category) {
    values.push(input.category);
    parts.push(`category = $${values.length}`);
  }
  if (input.providerId) {
    values.push(input.providerId);
    parts.push(`provider_id = $${values.length}`);
  }
  if (input.only === "on") parts.push("enabled = true");
  if (input.only === "off") parts.push("enabled = false");
  if (input.q) {
    values.push(`%${input.q.replace(/[%_]/g, "")}%`);
    parts.push(`(name ilike $${values.length} or service ilike $${values.length} or country ilike $${values.length} or network ilike $${values.length} or description ilike $${values.length})`);
  }
  const where = parts.length ? `where ${parts.join(" and ")}` : "";
  const page = Math.max(0, Number(input.page) || 0);
  const rows = await sql.query<Record<string, unknown>>(`select * from shop_products ${where} order by service, country, price limit 40 offset ${page * 40}`, values);
  const totalRows = await sql.query<{ n: number }>(`select count(*) as n from shop_products ${where}`, values);
  const liveRows = await sql.query<{ n: number }>("select count(*) as n from shop_products where enabled = true");
  return { rows: rows.map(rowOf), total: Number(totalRows[0]?.n) || 0, live: Number(liveRows[0]?.n) || 0 };
}
