import { getSql } from "@/lib/db";
import {
  buildCatalogRequest,
  emptySetup,
  liveTransport,
  mergeSetup,
  runCatalogProbe,
  type CatalogMethod,
  type CatalogProbe,
  type CatalogSetup,
} from "@/lib/catalog-request";

export type FetchReport = {
  provider: string;
  endpoint: string;
  method: string;
  auth: string;
  status: number;
  discovered: number;
  skipped: number;
  failed: number;
  error: string;
  note: string;
  shape: string;
  pages: boolean;
  confirmed: boolean;
  attempts: Array<{ method: string; status: number; kind: string; note: string }>;
};

type FetchRow = {
  id: string;
  method: string;
  auth_kind: string;
  header_name: string;
  content_type: string;
  query_json: string;
  body_json: string;
  headers_json: string;
  field_map: string;
  confirmed: boolean;
  last_status: number;
  last_error: string;
  last_method: string;
  products_seen: number;
};

function objectOf(text: string) {
  try {
    const value = JSON.parse(text || "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  } catch {
    return {};
  }
}

function stringMap(value: Record<string, unknown>) {
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) out[key] = String(item ?? "");
  return out;
}

function setupFromRow(row: FetchRow): CatalogSetup {
  const method = ["GET", "POST", "PUT", "PATCH"].includes(row.method) ? (row.method as CatalogSetup["method"]) : "";
  const auth = ["bearer", "token", "api-key", "basic", "custom", "none"].includes(row.auth_kind) ? (row.auth_kind as CatalogSetup["auth"]) : "";
  const contentType = row.content_type === "form" || row.content_type === "json" ? row.content_type : "";
  return {
    method,
    auth,
    headerName: row.header_name || "",
    contentType,
    query: stringMap(objectOf(row.query_json)),
    headers: stringMap(objectOf(row.headers_json)),
    body: objectOf(row.body_json),
    fieldMap: stringMap(objectOf(row.field_map)),
    confirmed: !!row.confirmed,
  };
}

export function reportOf(probe: CatalogProbe, endpoint: string, provider: string): FetchReport {
  return {
    provider,
    endpoint,
    method: probe.method,
    auth: probe.auth,
    status: probe.status,
    discovered: probe.discovered,
    skipped: probe.skipped,
    failed: probe.failed,
    error: probe.error,
    note: probe.note,
    shape: probe.shape,
    pages: probe.pages,
    confirmed: probe.setup.confirmed,
    attempts: probe.attempts.map((item) => ({ method: item.method, status: item.status, kind: item.kind, note: item.note })),
  };
}

export function fetchNote(report: FetchReport) {
  const method = report.method || "undetected";
  const auth = report.auth || "none";
  const status = report.status ? String(report.status) : report.attempts[0]?.kind || "—";
  return `${method} ${status} · ${auth} · ${report.discovered.toLocaleString("en-NG")} products recognized${report.pages ? " · paged" : ""}`;
}

export async function loadProviderFetch(providerId: string): Promise<CatalogSetup | null> {
  if (!providerId) return null;
  try {
    const sql = await getSql();
    const rows = await sql<FetchRow>`select id, method, auth_kind, header_name, content_type, query_json, body_json, headers_json, field_map, confirmed, last_status, last_error, last_method, products_seen from shop_provider_fetch where id = ${providerId}`;
    return rows[0] ? setupFromRow(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function saveProviderFetch(providerId: string, probe: CatalogProbe) {
  if (!providerId || !probe.setup.confirmed) return;
  const setup = probe.setup;
  const now = new Date().toISOString();
  try {
    const sql = await getSql();
    await sql.query(
      `insert into shop_provider_fetch (id, method, auth_kind, header_name, content_type, query_json, body_json, headers_json, field_map, confirmed, last_status, last_error, last_method, products_seen, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (id) do update set
         method = excluded.method, auth_kind = excluded.auth_kind, header_name = excluded.header_name,
         content_type = excluded.content_type, query_json = excluded.query_json, body_json = excluded.body_json,
         headers_json = excluded.headers_json, field_map = excluded.field_map, confirmed = excluded.confirmed,
         last_status = excluded.last_status, last_error = excluded.last_error, last_method = excluded.last_method,
         products_seen = excluded.products_seen, updated_at = excluded.updated_at`,
      [
        providerId,
        setup.method,
        setup.auth,
        setup.headerName,
        setup.contentType,
        JSON.stringify(setup.query),
        JSON.stringify(setup.body),
        JSON.stringify(setup.headers),
        JSON.stringify(setup.fieldMap),
        true,
        probe.status,
        probe.error.slice(0, 300),
        probe.method,
        probe.discovered,
        now,
      ],
    );
  } catch (err) {
    console.error("provider fetch setup was not saved", err instanceof Error ? err.message : err);
  }
}

export async function probeProviderCatalogue(input: {
  url: string;
  apiKey?: string;
  providerId?: string;
  draft?: CatalogSetup | null;
  timeoutMs?: number;
}) {
  const saved = input.providerId ? await loadProviderFetch(input.providerId) : null;
  const setup = mergeSetup(input.url, saved, input.draft ?? null);
  const probe = await runCatalogProbe(input.url, setup, input.apiKey || "", liveTransport(input.timeoutMs ?? 45000));
  if (input.providerId) await saveProviderFetch(input.providerId, probe);
  return probe;
}

export async function readCataloguePage(url: string, method: CatalogMethod, setup: CatalogSetup, apiKey: string, timeoutMs: number) {
  const built = buildCatalogRequest(url, method, setup, apiKey);
  const response = await liveTransport(timeoutMs)({ url: built.url, method: built.method, headers: built.headers, body: built.body });
  if (response.timedOut || response.network || response.status >= 400 || !response.text || response.text.length > 32_000_000) return null;
  try {
    return JSON.parse(response.text) as unknown;
  } catch {
    return null;
  }
}

export function blankSetup() {
  return emptySetup();
}
