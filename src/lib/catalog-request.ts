import { extractCatalog } from "./categorize.ts";

export const CATALOG_METHODS = ["GET", "POST", "PUT", "PATCH"] as const;
export type CatalogMethod = (typeof CATALOG_METHODS)[number];
export const CATALOG_AUTHS = ["bearer", "token", "api-key", "basic", "custom", "none"] as const;
export type CatalogAuth = (typeof CATALOG_AUTHS)[number];

export type CatalogSetup = {
  method: CatalogMethod | "";
  auth: CatalogAuth | "";
  headerName: string;
  contentType: "json" | "form" | "";
  query: Record<string, string>;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  fieldMap: Record<string, string>;
  confirmed: boolean;
};

export type AttemptKind = "ok" | "empty" | "unmap" | "method" | "auth" | "permission" | "missing" | "rate" | "server" | "timeout" | "json" | "network" | "large" | "unsafe";

export type CatalogAttempt = {
  method: CatalogMethod;
  status: number;
  kind: AttemptKind;
  note: string;
};

export type CatalogProbe = {
  ok: boolean;
  error: string;
  method: CatalogMethod | "";
  auth: CatalogAuth | "";
  status: number;
  payload: unknown | null;
  attempts: CatalogAttempt[];
  setup: CatalogSetup;
  discovered: number;
  skipped: number;
  failed: number;
  shape: string;
  pages: boolean;
  note: string;
};

export type CatalogTransport = (input: {
  url: string;
  method: CatalogMethod;
  headers: Record<string, string>;
  body?: string;
}) => Promise<{ status: number; text: string; timedOut?: boolean; network?: boolean }>;

const EMPTY_SETUP: CatalogSetup = {
  method: "",
  auth: "",
  headerName: "",
  contentType: "",
  query: {},
  headers: {},
  body: {},
  fieldMap: {},
  confirmed: false,
};

export function emptySetup(): CatalogSetup {
  return { ...EMPTY_SETUP, query: {}, headers: {}, body: {}, fieldMap: {} };
}

export function looksLikePurchase(url: string) {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\/(purchase|buy|order|orders|checkout|recharge|top-?up|payment|airtime|rent-a-number|rent-multiple-services|cancel-rental|re-rent|prices-info-stock|long-rentals|service-long-rentals)(\/|$)/.test(path)
      || /\/auctions\/[^/]+\/bid(\/|$)/.test(path);
  } catch {
    return false;
  }
}

export function isGetaTextHost(url: string) {
  try {
    return /(^|\.)getatext\.com$/i.test(new URL(url).hostname.replace(/^www\./, ""));
  } catch {
    return false;
  }
}

/** Documented catalogue. Legacy price URLs are rewritten. Purchase URLs are not. */
export function getatextCatalogueUrl(raw: string): string | null {
  if (!isGetaTextHost(raw) || looksLikePurchase(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const prices = path === "/api/v1/prices-info";
  const legacy = /\/stubs\/handler_api\.php$/i.test(path) || path === "/api/prices" || path === "/api/v1/prices" || path === "/api/v1/get-services";
  if (!prices && !legacy) return null;
  return "https://getatext.com/api/v1/prices-info";
}

export function publicEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    for (const key of [...url.searchParams.keys()]) {
      if (/^(api[_-]?key|token|access_token|secret|auth)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return String(endpoint || "").replace(/([?&](?:api[_-]?key|token|access_token|secret|auth)=)[^&]*/gi, "$1");
  }
}
export function hostHint(url: string): Partial<CatalogSetup> {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return {};
  }
  if (/smeapi\.com\.ng$/i.test(host)) return { method: "GET", auth: "token", headerName: "" };
  if (/(^|\.)getatext\.com$/i.test(host)) return { method: "GET", auth: "custom", headerName: "Auth" };
  if (/(^|\.)5sim\.net$/i.test(host)) return { method: "GET", auth: "none" };
  return {};
}

export function suggestedSetup(url: string) {
  const hint = hostHint(url);
  return { method: hint.method || "", auth: hint.auth || "", headerName: hint.headerName || "" };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function readJsonObject(text: string, label: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const raw = String(text || "").trim();
  if (!raw) return { ok: true, value: {} };
  try {
    const value = JSON.parse(raw) as unknown;
    const record = asRecord(value);
    if (!record) return { ok: false, error: `${label} must be a JSON object.` };
    return { ok: true, value: record };
  } catch {
    return { ok: false, error: `${label} is not valid JSON.` };
  }
}

function stringRecord(value: Record<string, unknown>, limit: number) {
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(key)) continue;
    if (Object.keys(out).length >= limit) break;
    out[key] = String(item ?? "").slice(0, 300);
  }
  return out;
}

export function parseSetupDraft(input: {
  method?: string;
  auth?: string;
  headerName?: string;
  contentType?: string;
  query?: string;
  headers?: string;
  body?: string;
  fieldMap?: string;
} | null | undefined): { ok: true; setup: CatalogSetup } | { ok: false; error: string } {
  const method = CATALOG_METHODS.includes(String(input?.method) as CatalogMethod) ? (String(input?.method) as CatalogMethod) : "";
  const auth = CATALOG_AUTHS.includes(String(input?.auth) as CatalogAuth) ? (String(input?.auth) as CatalogAuth) : "";
  const contentType = input?.contentType === "form" || input?.contentType === "json" ? input.contentType : "";
  const query = readJsonObject(String(input?.query || ""), "Query parameters");
  if (!query.ok) return query;
  const headers = readJsonObject(String(input?.headers || ""), "Headers");
  if (!headers.ok) return headers;
  const body = readJsonObject(String(input?.body || ""), "Request body");
  if (!body.ok) return body;
  const fieldMap = readJsonObject(String(input?.fieldMap || ""), "Field map");
  if (!fieldMap.ok) return fieldMap;
  return {
    ok: true,
    setup: {
      method,
      auth,
      headerName: String(input?.headerName || "").replace(/[^\w-]/g, "").slice(0, 40),
      contentType,
      query: stringRecord(query.value, 20),
      headers: stringRecord(headers.value, 20),
      body: body.value,
      fieldMap: stringRecord(fieldMap.value, 20),
      confirmed: false,
    },
  };
}

export function setupView(setup: CatalogSetup | null) {
  if (!setup) return null;
  return {
    method: setup.method,
    auth: setup.auth,
    headerName: setup.headerName,
    contentType: setup.contentType,
    query: { ...setup.query },
    headers: { ...setup.headers },
    body: JSON.stringify(setup.body ?? {}, null, 2),
    fieldMap: { ...setup.fieldMap },
    confirmed: setup.confirmed,
  };
}

export function mergeSetup(url: string, saved: CatalogSetup | null, draft: CatalogSetup | null): CatalogSetup {
  const hint = hostHint(url);
  const method = draft?.method || (saved?.confirmed ? saved.method : "") || hint.method || "";
  const auth = draft?.auth || (saved?.confirmed ? saved.auth : "") || hint.auth || "";
  const headerName = draft?.headerName || saved?.headerName || hint.headerName || "";
  const contentType = draft?.contentType || saved?.contentType || "";
  const query = draft && Object.keys(draft.query).length ? draft.query : saved?.query || {};
  const headers = draft && Object.keys(draft.headers).length ? draft.headers : saved?.headers || {};
  const body = draft && Object.keys(draft.body).length ? draft.body : saved?.body || {};
  const fieldMap = draft && Object.keys(draft.fieldMap).length ? draft.fieldMap : saved?.fieldMap || {};
  const draftChangedMethod = !!draft?.method && draft.method !== saved?.method;
  return {
    method,
    auth,
    headerName,
    contentType,
    query,
    headers,
    body,
    fieldMap,
    confirmed: !!saved?.confirmed && !draftChangedMethod && method === saved?.method,
  };
}

export function planAttempts(setup: CatalogSetup, url: string): { error: string; methods: CatalogMethod[] } {
  if (looksLikePurchase(url)) return { error: "That address places an order. Catalogue import will not call it.", methods: [] };
  if (isGetaTextHost(url)) return { error: "", methods: ["GET"] };
  if (setup.method === "PUT" || setup.method === "PATCH" || setup.method === "POST" || setup.method === "GET") return { error: "", methods: [setup.method] };
  return { error: "", methods: ["GET"] };
}

export function fallbackMethod(tried: CatalogMethod, url: string): CatalogMethod | "" {
  if (looksLikePurchase(url) || isGetaTextHost(url)) return "";
  if (tried === "GET") return "POST";
  if (tried === "POST" || tried === "PUT" || tried === "PATCH") return "GET";
  return "";
}

export function explainAttempt(kind: AttemptKind, status: number, method: CatalogMethod) {
  if (kind === "method") return `${method} is not allowed${status ? ` (${status})` : ""}.`;
  if (kind === "auth") return `Authentication failed${status ? ` (${status})` : ""}. Check the key and the authentication type.`;
  if (kind === "permission") return `The key does not have permission${status ? ` (${status})` : ""}.`;
  if (kind === "missing") return `That catalogue address was not found${status ? ` (${status})` : ""}.`;
  if (kind === "rate") return `The provider rate-limited the request${status ? ` (${status})` : ""}. Nothing was imported.`;
  if (kind === "timeout") return "The provider did not respond in time.";
  if (kind === "network") return "Could not reach that API. Check the URL and key.";
  if (kind === "json") return "The provider did not return JSON.";
  if (kind === "large") return "That catalogue is larger than 32MB.";
  if (kind === "empty") return "The catalogue was empty. Nothing was imported.";
  if (kind === "unmap") return "The response was JSON, but no products were recognized. Map id, name, and price, then test again.";
  if (kind === "unsafe") return "Catalogue import will not call a purchase endpoint.";
  if (kind === "server") return `The provider returned an error${status ? ` (${status})` : ""}.`;
  return "";
}

function headerName(value: string, fallback: string) {
  const clean = value.replace(/[^\w-]/g, "").slice(0, 40);
  return clean || fallback;
}

function stripSecretQuery(query: Record<string, string>) {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (/^(api[_-]?key|token|access_token|secret|auth)$/i.test(key)) continue;
    next[key] = value;
  }
  return next;
}

function basicToken(key: string) {
  if (typeof btoa === "function") return btoa(key);
  return Buffer.from(key).toString("base64");
}

export function buildCatalogRequest(url: string, method: CatalogMethod, setup: CatalogSetup, apiKey: string) {
  const forced = isGetaTextHost(url);
  const catalogue = forced ? getatextCatalogueUrl(url) : null;
  const target = new URL(catalogue || url);
  if (forced) {
    target.searchParams.delete("api_key");
    target.searchParams.delete("apiKey");
  }
  for (const [key, value] of Object.entries(setup.query)) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(key)) continue;
    if (forced && /^(api[_-]?key|token|access_token|secret|auth)$/i.test(key)) continue;
    target.searchParams.set(key, value.slice(0, 200));
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  for (const [key, value] of Object.entries(setup.headers)) {
    if (!/^[\w-]{1,40}$/.test(key)) continue;
    if (forced && /^(authorization|x-api-key|api-key)$/i.test(key)) continue;
    headers[key] = value.slice(0, 300);
  }
  const auth = forced ? "custom" : setup.auth || hostHint(url).auth || (apiKey ? "bearer" : "none");
  const sentMethod: CatalogMethod = forced ? "GET" : method;
  const name = headerName(forced ? "Auth" : setup.headerName, auth === "custom" ? "Authorization" : "X-API-Key");
  if (apiKey && auth === "bearer") headers.Authorization = `Bearer ${apiKey}`;
  else if (apiKey && auth === "token") headers.Authorization = `Token ${apiKey}`;
  else if (apiKey && auth === "basic") headers.Authorization = `Basic ${basicToken(apiKey)}`;
  else if (apiKey && (auth === "api-key" || auth === "custom")) headers[name] = apiKey;
  let body: string | undefined;
  if (sentMethod !== "GET") {
    if ((setup.contentType || "json") === "form") {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const form = new URLSearchParams();
      for (const [key, value] of Object.entries(setup.body)) form.set(key, String(value ?? "").slice(0, 500));
      body = form.toString();
    } else {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(setup.body || {});
    }
  }
  return { url: target.toString(), method: sentMethod, headers, body, auth, headerName: name, forced };
}

const FIELD_TARGETS = new Set(["id", "name", "price", "stock", "count", "network", "service", "validity", "country", "operator"]);

export function applyFieldMap(payload: unknown, map: Record<string, string>): unknown {
  const pairs = Object.entries(map).filter(([to, from]) => FIELD_TARGETS.has(to) && from);
  if (!pairs.length) return payload;
  const visit = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(visit);
    const bag = asRecord(node);
    if (!bag) return node;
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(bag)) next[key] = visit(value);
    if (pairs.some(([, from]) => from in bag)) {
      for (const [to, from] of pairs) {
        if (next[to] == null || next[to] === "") next[to] = bag[from];
      }
    }
    return next;
  };
  return visit(payload);
}

function payloadEmpty(payload: unknown) {
  if (payload == null) return true;
  if (Array.isArray(payload)) return payload.length === 0;
  const bag = asRecord(payload);
  return !bag || Object.keys(bag).length === 0;
}

export function inspectCatalog(payload: unknown) {
  const extracted = extractCatalog(payload);
  const shape = Array.isArray(payload) ? "array" : payload && typeof payload === "object" ? "object" : "other";
  const bag = asRecord(payload);
  const pages = !!bag && ["next", "next_page_url", "last_page", "pagination", "links"].some((key) => key in bag);
  return { shape, discovered: extracted.items.length, skipped: extracted.skipped, pages };
}

function classify(status: number, flags: { timedOut?: boolean; network?: boolean; json: boolean; empty: boolean; unmapped: boolean; large: boolean }): AttemptKind {
  if (flags.timedOut) return "timeout";
  if (flags.network) return "network";
  if (flags.large) return "large";
  if (status === 405) return "method";
  if (status === 401) return "auth";
  if (status === 403) return "permission";
  if (status === 404) return "missing";
  if (status === 429) return "rate";
  if (status >= 400 || status === 0) return "server";
  if (!flags.json) return "json";
  if (flags.empty) return "empty";
  if (flags.unmapped) return "unmap";
  return "ok";
}

export function liveTransport(timeoutMs: number): CatalogTransport {
  return async (input) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs));
    try {
      const res = await fetch(input.url, {
        method: input.method,
        headers: input.headers,
        body: input.method === "GET" ? undefined : input.body,
        signal: ctrl.signal,
      });
      return { status: res.status, text: await res.text() };
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      const timedOut = name === "AbortError" || name === "TimeoutError";
      return { status: 0, text: "", timedOut, network: !timedOut };
    } finally {
      clearTimeout(timer);
    }
  };
}

export async function runCatalogProbe(url: string, setup: CatalogSetup, apiKey: string, transport: CatalogTransport): Promise<CatalogProbe> {
  const planned = planAttempts(setup, url);
  const attempts: CatalogAttempt[] = [];
  const fail = (kind: AttemptKind, status: number, method: CatalogMethod | "", error = ""): CatalogProbe => ({
    ok: false,
    error: error || (method ? explainAttempt(kind, status, method) : planned.error),
    method,
    auth: setup.auth || hostHint(url).auth || "",
    status,
    payload: null,
    attempts,
    setup: { ...setup, confirmed: false },
    discovered: 0,
    skipped: 0,
    failed: 0,
    shape: "other",
    pages: false,
    note: "",
  });
  if (planned.error) return fail("unsafe", 0, "", planned.error);
  const queue = [...planned.methods];
  const tried = new Set<CatalogMethod>();
  while (queue.length) {
    const method = queue.shift() as CatalogMethod;
    if (tried.has(method)) continue;
    tried.add(method);
    const built = buildCatalogRequest(url, method, setup, apiKey);
    let response: { status: number; text: string; timedOut?: boolean; network?: boolean };
    try {
      response = await transport({ url: built.url, method: built.method, headers: built.headers, body: built.body });
    } catch {
      response = { status: 0, text: "", network: true };
    }
    const large = response.text.length > 32_000_000;
    if (response.text.trim() === "BAD_KEY") {
      attempts.push({ method, status: response.status, kind: "auth", note: "GetaText rejected the API key." });
      return {
        ...fail("auth", response.status, method, "GetaText rejected the API key."),
        attempts,
        note: attempts.map((item) => `${item.method} ${item.status || item.kind}`).join(" → "),
      };
    }
    let payload: unknown = null;
    let json = false;
    if (!large && response.text && !response.timedOut && !response.network && response.status < 400) {
      try {
        payload = JSON.parse(response.text) as unknown;
        json = true;
      } catch {
        json = false;
      }
    }
    const mapped = json ? applyFieldMap(payload, setup.fieldMap) : null;
    const seen = json ? inspectCatalog(mapped) : { shape: "other", discovered: 0, skipped: 0, pages: false };
    const kind = classify(response.status, {
      timedOut: response.timedOut,
      network: response.network,
      json: json || response.status >= 400,
      empty: json && payloadEmpty(payload),
      unmapped: json && seen.discovered === 0 && !payloadEmpty(payload),
      large,
    });
    attempts.push({ method: built.method, status: response.status, kind, note: explainAttempt(kind, response.status, built.method) });
    if (kind === "ok" || kind === "empty" || kind === "unmap") {
      const confirmed = {
        ...setup,
        method: built.method,
        auth: built.auth as CatalogSetup["auth"],
        headerName: built.forced ? built.headerName : setup.headerName,
        body: built.forced ? {} : setup.body,
        query: built.forced ? stripSecretQuery(setup.query) : setup.query,
        confirmed: true,
      };
      const error = kind === "ok" ? "" : explainAttempt(kind, response.status, built.method);
      return {
        ok: kind === "ok",
        error,
        method: built.method,
        auth: confirmed.auth,
        status: response.status,
        payload: kind === "ok" ? mapped : mapped,
        attempts,
        setup: confirmed,
        discovered: seen.discovered,
        skipped: seen.skipped,
        failed: kind === "ok" ? seen.skipped : seen.discovered,
        shape: seen.shape,
        pages: seen.pages,
        note: attempts.map((item) => `${item.method} ${item.status || item.kind}`).join(" → "),
      };
    }
    if (kind === "method") {
      const next = fallbackMethod(method, url);
      if (next && !tried.has(next)) queue.push(next);
      continue;
    }
    return {
      ...fail(kind, response.status, method),
      attempts,
      note: attempts.map((item) => `${item.method} ${item.status || item.kind}`).join(" → "),
    };
  }
  const last = attempts[attempts.length - 1];
  return fail(last?.kind || "method", last?.status || 0, last?.method || "GET");
}
