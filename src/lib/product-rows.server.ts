import type { Product } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { publicImage } from "@/lib/logs-map";
import { SHELF_CATEGORIES, shelfOf } from "@/lib/shelves";

const COLS = 27;

export function encodeCursor(row: { service: string; name: string; id: string }) {
  return `${row.service}\u001f${row.name}\u001f${row.id}`;
}

export function decodeCursor(cursor: string) {
  const [service = "", name = "", id = ""] = String(cursor || "").split("\u001f");
  return { service, name, id };
}

function pushTextSearch(parts: string[], values: unknown[], q: string | undefined) {
  const raw = String(q || "").trim().toLowerCase();
  if (!raw) return;
  const terms = raw.split(/[^0-9a-z]+/).filter(Boolean).slice(0, 8).map((term) => term.slice(0, 40));
  if (!terms.length) {
    parts.push("false");
    return;
  }
  values.push(terms.map((term) => `${term}:*`).join(" & "));
  parts.push(`search_vec @@ to_tsquery('simple', $${values.length})`);
}

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
    subcategory: String(row.marketplace_subcategory || ""),
    smmMin: Number(row.smm_min) || 0,
    smmMax: Number(row.smm_max) || 0,
    smmType: String(row.smm_type || ""),
    smmRefill: !!row.smm_refill,
    imageUrl: String(row.image_url || "").startsWith("https://") ? String(row.image_url) : "",
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
        product.subcategory || "",
        Math.max(0, Math.round(Number(product.smmMin) || 0)),
        Math.max(0, Math.round(Number(product.smmMax) || 0)),
        product.smmType || "",
        !!product.smmRefill,
        product.imageUrl && product.imageUrl.startsWith("https://") ? product.imageUrl : "",
        sync,
      );
      return `(${Array.from({ length: COLS }, (_, n) => `$${at + n + 1}`).join(",")})`;
    });
    await sql.query(
      `insert into shop_products (id, provider_id, external_id, category, name, service, country, network, price, cost, stock, operator, rate, rates, enabled, validity, variable, description, import_type, server_id, marketplace_subcategory, smm_min, smm_max, smm_type, smm_refill, image_url, sync)
       values ${groups.join(",")}
       on conflict (provider_id, external_id) do update set
         name = excluded.name, service = excluded.service, country = excluded.country, network = excluded.network,
         cost = excluded.cost, stock = excluded.stock, operator = excluded.operator,
         rate = excluded.rate, rates = excluded.rates, category = excluded.category,
         import_type = excluded.import_type, server_id = excluded.server_id, validity = excluded.validity,
         smm_min = excluded.smm_min, smm_max = excluded.smm_max, smm_type = excluded.smm_type, smm_refill = excluded.smm_refill,
         image_url = case when excluded.image_url <> '' then excluded.image_url else shop_products.image_url end,
         marketplace_subcategory = case when shop_products.marketplace_subcategory <> '' then shop_products.marketplace_subcategory else excluded.marketplace_subcategory end,
         enabled = shop_products.enabled,
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

export async function queryShelf(category: string, providerIds: string[], q = "", limit = 2000, network = "") {
  if (!providerIds.length || !category) return [];
  const sql = await getSql();
  const values: unknown[] = [category, providerIds];
  const parts = ["enabled = true", "category = $1", "provider_id = any($2::text[])"];
  pushTextSearch(parts, values, q);
  if (network) {
    values.push(network);
    parts.push(`network = $${values.length}`);
  }
  values.push(Math.max(1, Math.min(2000, limit)));
  const rows = await sql.query<Record<string, unknown>>(
    `select * from shop_products where ${parts.join(" and ")} order by network, name limit $${values.length}`,
    values,
  );
  return rows.map(rowOf);
}

export async function catalogCounts() {
  const sql = await getSql();
  const rows = await sql.query<{ category: string; provider_id: string; n: number; live: number }>(
    `select category, provider_id, count(*) as n, count(*) filter (where enabled) as live
     from shop_products group by category, provider_id`,
  );
  const byCategory: Record<string, number> = {};
  const byProvider: Record<string, { count: number; live: number }> = {};
  let total = 0;
  let live = 0;
  for (const row of rows) {
    const n = Number(row.n) || 0;
    const on = Number(row.live) || 0;
    total += n;
    live += on;
    byCategory[row.category] = (byCategory[row.category] || 0) + n;
    const prev = byProvider[row.provider_id] || { count: 0, live: 0 };
    byProvider[row.provider_id] = { count: prev.count + n, live: prev.live + on };
  }
  return { total, live, byCategory, byProvider };
}

export async function sampleProducts(limit = 12) {
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>("select * from shop_products order by category, name limit $1", [Math.max(1, Math.min(40, limit))]);
  return rows.map(rowOf);
}

export async function decrementStock(id: string) {
  if (!id) return;
  const sql = await getSql();
  await sql.query("update shop_products set stock = case when stock > 0 then stock - 1 else stock end where id = $1", [id]);
}

export async function queryExtras(input: { q?: string; providerIds: string[]; kind?: "vpn" | "smm" | "random" | "shop"; page?: number; subcategory?: string; after?: string }) {
  if (!input.providerIds.length) return { rows: [] as Product[], more: false, next: "" };
  const sql = await getSql();
  const shelf = shelfOf(input.kind === "shop" ? "random" : input.kind);
  const categories = [...SHELF_CATEGORIES[shelf]];
  const values: unknown[] = [input.providerIds, categories];
  const parts = ["enabled = true", "provider_id = any($1::text[])", "category = any($2::text[])"];
  pushTextSearch(parts, values, input.q);
  if (input.subcategory) {
    values.push(input.subcategory);
    parts.push(`marketplace_subcategory = $${values.length}`);
  }
  const cursor = input.after ? decodeCursor(input.after) : null;
  if (cursor?.id) {
    values.push(cursor.service, cursor.name, cursor.id);
    parts.push(`(service, name, id) > ($${values.length - 2}, $${values.length - 1}, $${values.length})`);
  }
  const limit = 40;
  values.push(limit + 1);
  const offset = cursor?.id ? 0 : Math.max(0, Math.min(5000, Math.floor(Number(input.page) || 0))) * limit;
  const rows = await sql.query<Record<string, unknown>>(
    `select * from shop_products where ${parts.join(" and ")} order by service, name, id limit $${values.length}${offset ? ` offset ${offset}` : ""}`,
    values,
  );
  const more = rows.length > limit;
  const page = rows.slice(0, limit).map(rowOf);
  const last = page[page.length - 1];
  return { rows: page, more, next: more && last ? encodeCursor(last) : "" };
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

export async function setProductSubcategory(id: string, subcategory: string) {
  const sql = await getSql();
  const name = subcategory.trim().slice(0, 40);
  const rows = await sql.query<{ id: string }>(
    "update shop_products set marketplace_subcategory = $2 where id = $1 and category in ('logs', 'smm') returning id",
    [id, name],
  );
  return !!rows[0];
}

/** Updates the logo only. Name, price, category and provider id stay as they are. */
export async function setProductImage(id: string, imageUrl: string) {
  const url = publicImage(imageUrl);
  if (!id || !url) return false;
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>(
    "update shop_products set image_url = $2 where id = $1 returning id",
    [id, url],
  );
  return !!rows[0];
}

export async function paintProductLogos(providerId: string, rows: Array<{ externalId: string; imageUrl: string }>) {
  const usable = rows.filter((row) => row.externalId && publicImage(row.imageUrl));
  if (!providerId || !usable.length) return 0;
  const sql = await getSql();
  let updated = 0;
  for (let i = 0; i < usable.length; i += 80) {
    const slice = usable.slice(i, i + 80);
    const values: unknown[] = [providerId];
    const pairs = slice.map((row) => {
      values.push(row.externalId, publicImage(row.imageUrl));
      const id = values.length - 1;
      return `($${id - 1}::text, $${id}::text)`;
    });
    const written = await sql.query<{ id: string }>(
      `update shop_products as product
       set image_url = logo.image_url
       from (values ${pairs.join(",")}) as logo(external_id, image_url)
       where product.provider_id = $1
         and product.external_id = logo.external_id
         and logo.image_url <> ''
         and product.image_url is distinct from logo.image_url
       returning product.id`,
      values,
    );
    updated += written.length;
  }
  return updated;
}

export async function logoGaps(providerId: string) {
  if (!providerId) return { missing: 0, categories: [] as string[] };
  const sql = await getSql();
  const rows = await sql.query<{ missing: string; category: string }>(
    `select count(*) filter (where coalesce(image_url, '') = '')::text as missing,
            coalesce(marketplace_subcategory, '') as category
     from shop_products
     where provider_id = $1 and category in ('logs', 'smm')
     group by marketplace_subcategory`,
    [providerId],
  );
  const missing = rows.reduce((sum, row) => sum + (Number(row.missing) || 0), 0);
  const categories = rows.filter((row) => Number(row.missing) > 0).map((row) => row.category || "Uncategorized");
  return { missing, categories };
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
    const country = String(input.country).trim().toLowerCase();
    if (country === "usa" || country === "us" || country === "united states") {
      parts.push(`lower(country) in ('usa', 'us', 'united states', 'united states of america')`);
    } else {
      values.push(input.country);
      parts.push(`country = $${values.length}`);
    }
  }
  if (input.service) {
    values.push(input.service);
    parts.push(`service = $${values.length}`);
  }
  pushTextSearch(parts, values, input.q);
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

/** A stocked WhatsApp row outside the alphabetical page. Does not invent one. */
export async function queryWhatsAppOffer(input: BrowseInput) {
  const sql = await getSql();
  const values: unknown[] = [];
  const where = filters({ ...input, service: "", q: "" }, values);
  const rows = await sql.query<{ service: string; provider_id: string; cost: number; price: number }>(
    `select service, provider_id, min(cost) as cost, min(price) as price
     from shop_products
     where ${where}
       and stock > 0
       and lower(regexp_replace(service, '[^a-zA-Z0-9]', '', 'g')) = 'whatsapp'
     group by service, provider_id
     order by service
     limit 5`,
    values,
  );
  return rows.map((row) => ({ service: row.service, providerId: row.provider_id, cost: Number(row.cost) || 0, price: Number(row.price) || 0 }));
}

export async function queryCountries(input: BrowseInput) {
  const sql = await getSql();
  const values: unknown[] = [];
  const where = filters(input, values);
  const rows = await sql.query<Record<string, unknown>>(
    `select distinct on (country) * from shop_products where ${where} order by country, price asc limit 300`,
    values,
  );
  return rows.map(rowOf).sort((a, b) => a.price - b.price || a.country.localeCompare(b.country));
}

export async function queryOperators(input: BrowseInput) {
  const sql = await getSql();
  const values: unknown[] = [];
  const where = filters(input, values);
  const rows = await sql.query<Record<string, unknown>>(
    `select * from shop_products where ${where} order by rate desc, price asc, operator asc limit 200`,
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

export async function queryCatalogPage(input: { q?: string; category?: string; providerId?: string; only?: string; page?: number; subcategory?: string; after?: string }) {
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
  if (input.subcategory === "none") parts.push("marketplace_subcategory = ''");
  else if (input.subcategory) {
    values.push(input.subcategory);
    parts.push(`marketplace_subcategory = $${values.length}`);
  }
  pushTextSearch(parts, values, input.q);
  const filterValues = [...values];
  const filterWhere = parts.length ? `where ${parts.join(" and ")}` : "";
  const cursor = input.after ? decodeCursor(input.after) : null;
  if (cursor?.id) {
    values.push(cursor.service, cursor.name, cursor.id);
    parts.push(`(service, name, id) > ($${values.length - 2}, $${values.length - 1}, $${values.length})`);
  }
  const where = parts.length ? `where ${parts.join(" and ")}` : "";
  const page = Math.max(0, Number(input.page) || 0);
  const offset = cursor?.id ? 0 : page * 40;
  const rows = await sql.query<Record<string, unknown>>(
    `select * from shop_products ${where} order by service, name, id limit 41${offset ? ` offset ${offset}` : ""}`,
    values,
  );
  const more = rows.length > 40;
  const sliced = rows.slice(0, 40).map(rowOf);
  const last = sliced[sliced.length - 1];
  const totalRows = await sql.query<{ n: number }>(`select count(*) as n from shop_products ${filterWhere}`, filterValues);
  const liveRows = await sql.query<{ n: number }>("select count(*) as n from shop_products where enabled = true");
  return {
    rows: sliced,
    total: Number(totalRows[0]?.n) || 0,
    live: Number(liveRows[0]?.n) || 0,
    next: more && last ? encodeCursor(last) : "",
  };
}
