import type { Product } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { cleanFieldMap, cleanPageMap, lastPageOf, mapLogProducts, publicHttpsUrl, type MappedLog } from "@/lib/logs-map";
import { uid } from "@/lib/money";
import { customerPrice, profitsOf } from "@/lib/pricing";
import { logoGaps, paintProductLogos, upsertProductRows } from "@/lib/product-rows.server";

type LogRow = {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  products_path: string;
  method: string;
  auth_method: string;
  api_key_header: string;
  extra_headers: string;
  query_json: string;
  body_json: string;
  pagination_json: string;
  field_map: string;
  enabled: boolean;
  currency: string;
  usd_rate: number;
  provider_id: string;
  last_status: string;
  last_error: string;
  last_imported: number;
  last_page: number;
};

export type LogProviderInput = {
  id?: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  productsPath: string;
  method: string;
  authMethod: string;
  apiKeyHeader: string;
  extraHeaders: string;
  queryJson: string;
  bodyJson: string;
  paginationJson: string;
  fieldMap: string;
  enabled: boolean;
  currency: string;
  usdRate: number;
};

function jsonObject(text: string) {
  try {
    const value = JSON.parse(text || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function publicRow(row: LogRow) {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    hasKey: !!row.api_key,
    productsPath: row.products_path,
    method: row.method === "POST" ? "POST" : "GET",
    authMethod: row.auth_method,
    apiKeyHeader: row.api_key_header,
    extraHeaders: row.extra_headers,
    queryJson: row.query_json,
    bodyJson: row.body_json,
    paginationJson: row.pagination_json,
    fieldMap: row.field_map,
    enabled: !!row.enabled,
    currency: row.currency === "NGN" ? "NGN" : "USD",
    usdRate: Number(row.usd_rate) || 0,
    lastStatus: row.last_status,
    lastError: row.last_error,
    lastImported: Number(row.last_imported) || 0,
    lastPage: Number(row.last_page) || 0,
  };
}

export async function readLogKeyForShopProvider(providerId: string) {
  if (!providerId) return "";
  const sql = await getSql();
  const rows = await sql<{ api_key: string }>`select api_key from shop_log_providers where provider_id = ${providerId} and enabled = true`;
  return String(rows[0]?.api_key || "").trim();
}

async function mirrorProviderKey(providerId: string, apiKey: string) {
  const key = apiKey.trim();
  if (!providerId || !key) return;
  const sql = await getSql();
  const rows = await sql`select provider_id from provider_keys where provider_id = ${providerId}`;
  if (rows[0]) await sql`update provider_keys set api_key = ${key} where provider_id = ${providerId}`;
  else await sql`insert into provider_keys (provider_id, api_key) values (${providerId}, ${key})`;
}

async function readRow(id: string) {
  const sql = await getSql();
  const rows = await sql<LogRow>`select * from shop_log_providers where id = ${id}`;
  return rows[0] || null;
}

export async function listLogProviders() {
  const sql = await getSql();
  const rows = await sql<LogRow>`select * from shop_log_providers order by name`;
  return rows.map(publicRow);
}

export async function saveLogProvider(input: LogProviderInput) {
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: "Enter a provider name.", provider: null };
  const checked = publicHttpsUrl(input.baseUrl, input.productsPath || "/");
  if (!checked.ok) return { error: checked.error, provider: null };
  if (jsonObject(input.extraHeaders) == null || jsonObject(input.queryJson) == null || jsonObject(input.bodyJson) == null) {
    return { error: "Headers, query and body must be JSON objects.", provider: null };
  }
  const method = input.method === "POST" ? "POST" : "GET";
  const auth = ["header", "bearer", "query", "none"].includes(input.authMethod) ? input.authMethod : "header";
  const header = (input.apiKeyHeader || "X-API-Key").replace(/[^\w-]/g, "").slice(0, 40) || "X-API-Key";
  const fields = cleanFieldMap(jsonObject(input.fieldMap));
  const page = cleanPageMap(jsonObject(input.paginationJson));
  const base = new URL(input.baseUrl.trim());
  const baseUrl = `${base.origin}${base.pathname}`.replace(/\/$/, "");
  const sql = await getSql();
  const id = input.id?.trim() || uid("log");
  const existing = await readRow(id);
  const apiKey = input.apiKey?.trim() ? input.apiKey.trim().slice(0, 300) : existing?.api_key || "";
  const currency = input.currency === "NGN" ? "NGN" : "USD";
  const usdRate = Math.max(0, Math.round(Number(input.usdRate) || 0));
  const now = new Date().toISOString();
  if (existing) {
    await sql`update shop_log_providers set
      name = ${name}, base_url = ${baseUrl},
      api_key = ${apiKey}, products_path = ${input.productsPath.slice(0, 160)}, method = ${method},
      auth_method = ${auth}, api_key_header = ${header}, extra_headers = ${input.extraHeaders.slice(0, 2000)},
      query_json = ${input.queryJson.slice(0, 2000)}, body_json = ${input.bodyJson.slice(0, 2000)},
      pagination_json = ${JSON.stringify(page)}, field_map = ${JSON.stringify(fields)},
      enabled = ${!!input.enabled}, currency = ${currency}, usd_rate = ${usdRate}, updated_at = ${now}
      where id = ${id}`;
  } else {
    await sql`insert into shop_log_providers
      (id, name, base_url, api_key, products_path, method, auth_method, api_key_header, extra_headers, query_json, body_json, pagination_json, field_map, enabled, currency, usd_rate, updated_at)
      values (${id}, ${name}, ${baseUrl}, ${apiKey}, ${input.productsPath.slice(0, 160)}, ${method}, ${auth}, ${header}, ${input.extraHeaders.slice(0, 2000)}, ${input.queryJson.slice(0, 2000)}, ${input.bodyJson.slice(0, 2000)}, ${JSON.stringify(page)}, ${JSON.stringify(fields)}, ${!!input.enabled}, ${currency}, ${usdRate}, ${now})`;
  }
  const saved = await readRow(id);
  if (saved?.provider_id && saved.api_key) await mirrorProviderKey(saved.provider_id, saved.api_key);
  return { error: null as string | null, provider: saved ? publicRow(saved) : null };
}

export async function deleteLogProvider(id: string) {
  const row = await readRow(id);
  if (!row) return { error: "That provider was not found.", removed: 0 };
  const sql = await getSql();
  let removed = 0;
  if (row.provider_id) {
    const count = await sql.query<{ n: number }>("select count(*) as n from shop_products where provider_id = $1", [row.provider_id]);
    removed = Number(count[0]?.n) || 0;
    await sql.query("delete from shop_products where provider_id = $1", [row.provider_id]);
    await disableShopProvider(row.provider_id);
  }
  await sql`delete from shop_log_providers where id = ${id}`;
  return { error: null as string | null, removed };
}

async function disableShopProvider(providerId: string) {
  const sql = await getSql();
  const rows = await sql<{ doc: string }>`select doc from shop_state where id = 'main'`;
  if (!rows[0]) return;
  const doc = JSON.parse(rows[0].doc) as { providers?: Array<Record<string, unknown>> };
  doc.providers = (doc.providers || []).map((provider) => provider.id === providerId ? { ...provider, enabled: false } : provider);
  await sql`update shop_state set doc = ${JSON.stringify(doc)} where id = 'main'`;
}

async function shopPricing() {
  const sql = await getSql();
  const rows = await sql<{ doc: string }>`select doc from shop_state where id = 'main'`;
  const settings = rows[0] ? (JSON.parse(rows[0].doc) as { settings?: { generalProfit?: number; airtimeProfit?: number; dataProfit?: number; usdNgn?: number } }).settings || {} : {};
  return { profits: profitsOf({ general: settings.generalProfit, airtime: settings.airtimeProfit, data: settings.dataProfit }), usdNgn: Number(settings.usdNgn) || 1343 };
}

async function ensureShopProvider(row: LogRow) {
  if (row.provider_id) return row.provider_id;
  const sql = await getSql();
  const id = `prov_${row.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`;
  const state = await sql<{ doc: string }>`select doc from shop_state where id = 'main'`;
  if (state[0]) {
    const doc = JSON.parse(state[0].doc) as { providers?: Array<Record<string, unknown>> };
    const providers = doc.providers || [];
    if (!providers.some((provider) => provider.id === id)) {
      providers.push({
        id,
        name: row.name,
        baseUrl: row.base_url,
        hasKey: !!row.api_key,
        servesNumbers: false,
        enabled: true,
        currency: row.currency === "NGN" ? "NGN" : "USD",
        usdRate: Number(row.usd_rate) || 0,
        markup: 1,
        markupPercent: 0,
        operatorMarkups: {},
        operatorPrices: {},
        importType: "RANDOM_IMPORT",
        serverId: "",
        createdAt: new Date().toISOString(),
        lastSync: null,
      });
      doc.providers = providers;
      await sql`update shop_state set doc = ${JSON.stringify(doc)} where id = 'main'`;
    }
  }
  await sql`update shop_log_providers set provider_id = ${id} where id = ${row.id}`;
  if (row.api_key) await mirrorProviderKey(id, row.api_key);
  return id;
}

async function callProvider(row: LogRow, pageNumber: number) {
  const checked = publicHttpsUrl(row.base_url, row.products_path || "/");
  if (!checked.ok) return { ok: false as const, error: checked.error, body: null, status: 0 };
  const url = checked.url;
  const query = jsonObject(row.query_json) || {};
  const page = cleanPageMap(jsonObject(row.pagination_json));
  if (page.mode === "page") url.searchParams.set(page.pageParam, String(pageNumber));
  for (const [key, value] of Object.entries(query)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(key)) continue;
    url.searchParams.set(key, String(value).slice(0, 200));
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  const extra = jsonObject(row.extra_headers) || {};
  for (const [key, value] of Object.entries(extra)) {
    if (!/^[A-Za-z0-9-]{1,40}$/.test(key)) continue;
    headers[key] = String(value).slice(0, 300);
  }
  if (row.api_key && row.auth_method === "bearer") headers.Authorization = `Bearer ${row.api_key}`;
  else if (row.api_key && row.auth_method !== "none" && row.auth_method !== "query") headers[row.api_key_header || "X-API-Key"] = row.api_key;
  if (row.api_key && row.auth_method === "query") url.searchParams.set(row.api_key_header || "api_key", row.api_key);
  const method = row.method === "POST" ? "POST" : "GET";
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: method === "POST" ? { ...headers, "Content-Type": "application/json" } : headers,
      body: method === "POST" ? JSON.stringify(jsonObject(row.body_json) || {}) : undefined,
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    return { ok: false as const, error: "The provider did not respond in time.", body: null, status: 0 };
  }
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > 2_000_000) return { ok: false as const, error: "The provider response is too large.", body: null, status: res.status };
  let body: unknown = null;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { ok: false as const, error: "The provider did not return JSON.", body: null, status: res.status };
  }
  if (!res.ok) return { ok: false as const, error: `The provider replied ${res.status}. Nothing was imported.`, body, status: res.status };
  return { ok: true as const, error: "", body, status: res.status };
}

function toProducts(items: MappedLog[], providerId: string, currency: "NGN" | "USD", usdRate: number, profits: ReturnType<typeof profitsOf>): Product[] {
  return items.map((item) => {
    const group = [item.category, item.subcategory].filter(Boolean).join(" · ");
    const price = customerPrice({ cost: item.price, currency, usdRate, category: "logs", profits }).price;
    return {
      id: uid("prd"),
      providerId,
      externalId: item.externalId,
      category: "logs",
      name: item.name,
      service: item.name,
      country: "",
      network: item.category,
      price,
      cost: item.price,
      stock: item.stock,
      operator: "",
      rate: 0,
      rates: "",
      enabled: true,
      validity: "",
      variable: false,
      description: item.description,
      importType: "RANDOM_IMPORT",
      serverId: "",
      subcategory: group || item.category,
      imageUrl: item.imageUrl,
    };
  });
}

async function remember(id: string, patch: { status: string; error?: string; imported?: number; page?: number }) {
  const sql = await getSql();
  await sql`update shop_log_providers set last_status = ${patch.status}, last_error = ${patch.error || ""}, last_imported = ${patch.imported ?? 0}, last_page = ${patch.page ?? 0}, updated_at = ${new Date().toISOString()} where id = ${id}`;
}

export async function testLogProvider(id: string) {
  const row = await readRow(id);
  if (!row) return { ok: false, error: "That provider was not found.", count: 0 };
  if (!row.enabled) return { ok: false, error: "Enable the provider before testing it.", count: 0 };
  const page = cleanPageMap(jsonObject(row.pagination_json));
  const called = await callProvider(row, page.pageStart);
  if (!called.ok) {
    await remember(id, { status: "failed", error: called.error, imported: row.last_imported, page: row.last_page });
    return { ok: false, error: called.error, count: 0 };
  }
  const items = mapLogProducts(called.body, cleanFieldMap(jsonObject(row.field_map)));
  await remember(id, { status: "tested", error: "", imported: row.last_imported, page: row.last_page });
  return { ok: true, error: "", count: items.length };
}

export async function previewLogProvider(id: string) {
  const row = await readRow(id);
  if (!row) return { error: "That provider was not found.", rows: [] as MappedLog[] };
  const page = cleanPageMap(jsonObject(row.pagination_json));
  const called = await callProvider(row, page.pageStart);
  if (!called.ok) return { error: called.error, rows: [] as MappedLog[] };
  return { error: null as string | null, rows: mapLogProducts(called.body, cleanFieldMap(jsonObject(row.field_map))).slice(0, 12) };
}

export async function importLogProvider(id: string, resume = false) {
  const row = await readRow(id);
  if (!row) return { error: "That provider was not found.", imported: 0, created: 0 };
  if (!row.enabled) return { error: "Enable the provider before importing.", imported: 0, created: 0 };
  const providerId = await ensureShopProvider(row);
  const fields = cleanFieldMap(jsonObject(row.field_map));
  const page = cleanPageMap(jsonObject(row.pagination_json));
  const { profits, usdNgn } = await shopPricing();
  const currency = row.currency === "NGN" ? "NGN" : "USD";
  const usdRate = Number(row.usd_rate) || usdNgn;
  let pageNumber = resume && row.last_status === "failed" && row.last_page > 0 ? row.last_page + 1 : page.pageStart;
  let imported = 0;
  let guard = 0;
  const seen = new Set<string>();
  while (guard < 40) {
    guard += 1;
    const called = await callProvider(row, pageNumber);
    if (!called.ok) {
      await remember(id, { status: "failed", error: called.error, imported, page: Math.max(0, pageNumber - 1) });
      return { error: called.error, imported, created: imported };
    }
    const mapped = mapLogProducts(called.body, fields).filter((item) => {
      if (seen.has(item.externalId)) return false;
      seen.add(item.externalId);
      return true;
    });
    if (mapped.length) {
      const products = toProducts(mapped, providerId, currency, usdRate, profits);
      await upsertProductRows(products, `logs-${id}`);
      imported += products.length;
    }
    const last = page.mode === "page" ? lastPageOf(called.body, page) : 0;
    if (page.mode !== "page" || !mapped.length || (last && pageNumber >= last)) break;
    pageNumber += 1;
  }
  await remember(id, { status: "imported", error: "", imported, page: pageNumber });
  return { error: null as string | null, imported, created: imported };
}

/** Fetches provider logos and writes image URLs only. Products, prices and ids are not changed. */
export async function refreshLogLogos(id: string) {
  const row = await readRow(id);
  if (!row) return { error: "That provider was not found.", updated: 0, missing: 0, categories: [] as string[] };
  if (!row.enabled) return { error: "Enable the provider before refreshing logos.", updated: 0, missing: 0, categories: [] as string[] };
  const providerId = row.provider_id || await ensureShopProvider(row);
  const fields = cleanFieldMap(jsonObject(row.field_map));
  const page = cleanPageMap(jsonObject(row.pagination_json));
  let pageNumber = page.pageStart;
  let updated = 0;
  let guard = 0;
  const seen = new Set<string>();
  while (guard < 40) {
    guard += 1;
    const called = await callProvider(row, pageNumber);
    if (!called.ok) {
      const gaps = await logoGaps(providerId);
      return { error: called.error, updated, missing: gaps.missing, categories: gaps.categories };
    }
    const all = mapLogProducts(called.body, fields);
    const mapped = all.filter((item) => {
      if (!item.imageUrl || seen.has(item.externalId)) return false;
      seen.add(item.externalId);
      return true;
    });
    if (mapped.length) updated += await paintProductLogos(providerId, mapped.map((item) => ({ externalId: item.externalId, imageUrl: item.imageUrl })));
    const last = page.mode === "page" ? lastPageOf(called.body, page) : 0;
    if (page.mode !== "page" || !all.length || (last && pageNumber >= last)) break;
    pageNumber += 1;
  }
  const gaps = await logoGaps(providerId);
  return { error: null as string | null, updated, missing: gaps.missing, categories: gaps.categories };
}
