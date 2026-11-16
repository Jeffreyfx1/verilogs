const LIST_KEYS = ["data", "items", "products", "services", "results", "list", "records", "plans", "rows", "catalog", "catalogue"] as const;
const HOP_CAP = 80;
const ITEM_CAP = 120_000;

type Bag = Record<string, unknown>;

function asBag(value: unknown): Bag | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Bag;
}

export function findCatalogList(node: unknown, depth = 0): { parent: Bag; key: string; list: unknown[] } | null {
  const bag = asBag(node);
  if (!bag || depth > 5) return null;
  for (const key of LIST_KEYS) {
    const value = bag[key];
    if (Array.isArray(value) && value.length > 0 && value.some((item) => item && typeof item === "object")) {
      return { parent: bag, key, list: value };
    }
  }
  for (const key of LIST_KEYS) {
    const nested = findCatalogList(bag[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

function stampOf(item: unknown): string {
  const bag = asBag(item);
  if (!bag) return JSON.stringify(item).slice(0, 180);
  for (const key of ["id", "service_id", "product_id", "external_id", "sku", "ID", "Id"]) {
    const value = bag[key];
    if (value != null && String(value).trim() !== "") return `${key}:${String(value)}`;
  }
  return JSON.stringify(item).slice(0, 240);
}

function bagsOf(body: unknown): Bag[] {
  const bag = asBag(body);
  if (!bag) return [];
  const data = asBag(bag.data);
  return [bag, data, asBag(bag.meta), asBag(bag.pagination), asBag(bag.links), asBag(bag.page), asBag(bag.paging), asBag(bag.info), data && asBag(data.meta), data && asBag(data.pagination)].filter((item): item is Bag => !!item);
}

function numIn(bags: Bag[], keys: string[]): number | null {
  for (const bag of bags) {
    for (const key of keys) {
      const n = Number(bag[key]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function absUrl(value: unknown, base: URL): URL | null {
  if (typeof value !== "string" || !value.trim() || value === "null") return null;
  try {
    const next = new URL(value, base);
    if (next.protocol !== "http:" && next.protocol !== "https:") return null;
    return next;
  } catch {
    return null;
  }
}

function withPage(start: URL, page: number): URL {
  const next = new URL(start);
  const key = next.searchParams.has("p") && !next.searchParams.has("page") ? "p" : "page";
  next.searchParams.set(key, String(page));
  return next;
}

export function nextCatalogUrl(start: URL, body: unknown, page: number, collected: number, pageSize: number): URL | null {
  const bags = bagsOf(body);
  for (const bag of bags) {
    for (const key of ["next", "next_page_url", "nextPage", "next_url", "next_page"]) {
      const next = absUrl(bag[key], start);
      if (next && next.href !== start.href) return next;
    }
  }
  const last = numIn(bags, ["last_page", "lastPage", "pages", "total_pages", "pageCount", "totalPages"]);
  const current = numIn(bags, ["current_page", "currentPage", "page"]) ?? page;
  const total = numIn(bags, ["total", "total_count", "totalCount"]);
  const per = numIn(bags, ["per_page", "perPage", "limit", "page_size", "pageSize"]);
  if (last != null && current < last) return withPage(start, current + 1);
  if (total != null && collected < total) {
    const limit = per || Number(start.searchParams.get("limit") || start.searchParams.get("per_page") || pageSize || 0);
    if (start.searchParams.has("offset") || (limit > 0 && !start.searchParams.has("page") && !start.searchParams.has("p"))) {
      const next = new URL(start);
      const offset = Number(next.searchParams.get("offset") || 0) + (limit || pageSize);
      next.searchParams.set("offset", String(offset));
      if (limit && !next.searchParams.has("limit") && !next.searchParams.has("per_page")) next.searchParams.set("limit", String(limit));
      return next;
    }
    return withPage(start, (current || page) + 1);
  }
  for (const bag of bags) {
    const cursor = bag.cursor ?? bag.next_cursor ?? bag.nextCursor;
    if (typeof cursor === "string" && cursor && cursor !== "null") {
      const next = new URL(start);
      next.searchParams.set("cursor", cursor);
      if (next.href !== start.href) return next;
    }
  }
  return null;
}

function widen(start: URL, body: unknown): URL | null {
  const bags = bagsOf(body);
  const per = numIn(bags, ["per_page", "perPage", "limit", "page_size", "pageSize"]);
  if (per == null || per <= 0 || per >= 200) return null;
  const next = new URL(start);
  if (next.searchParams.has("per_page") || numIn(bags, ["per_page", "perPage"]) != null) next.searchParams.set("per_page", "500");
  else if (next.searchParams.has("page_size") || numIn(bags, ["page_size", "pageSize"]) != null) next.searchParams.set("page_size", "500");
  else next.searchParams.set("limit", "500");
  if (next.searchParams.has("page")) next.searchParams.set("page", "1");
  if (next.searchParams.has("offset")) next.searchParams.set("offset", "0");
  return next.href === start.href ? null : next;
}

export function catalogStamp(item: unknown) {
  return stampOf(item);
}

export function catalogMeta(body: unknown) {
  const bags = bagsOf(body);
  return {
    total: numIn(bags, ["total", "total_count", "totalCount", "count"]),
    page: numIn(bags, ["current_page", "currentPage", "page"]),
    lastPage: numIn(bags, ["last_page", "lastPage", "pages", "total_pages", "pageCount", "totalPages"]),
    perPage: numIn(bags, ["per_page", "perPage", "limit", "page_size", "pageSize"]),
  };
}

export async function prepareCatalogBody(start: URL, first: unknown, fetchPage: (url: URL) => Promise<unknown | null>) {
  const hit = findCatalogList(first);
  if (!hit) return { source: start, body: first, list: [] as unknown[] };
  let source = start;
  let body = first;
  let list = hit.list;
  const wider = widen(start, first);
  if (wider) {
    const retried = await fetchPage(wider);
    const again = retried ? findCatalogList(retried) : null;
    if (again && again.list.length > list.length) {
      source = wider;
      body = retried as unknown;
      list = again.list;
    }
  }
  return { source, body, list };
}

export async function followCatalogPages(start: URL, first: unknown, fetchPage: (url: URL) => Promise<unknown | null>): Promise<unknown> {
  if (Array.isArray(first)) {
    const out: unknown[] = [];
    for (const part of first) out.push(await followCatalogPages(start, part, fetchPage));
    return out;
  }
  const prepared = await prepareCatalogBody(start, first, fetchPage);
  if (prepared.list.length < 10) return first;
  let source = prepared.source;
  let body = prepared.body;
  let list = prepared.list;
  const seen = new Set<string>();
  const merged: unknown[] = [];
  const take = (rows: unknown[]) => {
    let added = 0;
    for (const item of rows) {
      if (merged.length >= ITEM_CAP) break;
      const stamp = stampOf(item);
      if (seen.has(stamp)) continue;
      seen.add(stamp);
      merged.push(item);
      added += 1;
    }
    return added;
  };
  take(list);
  const explicit = nextCatalogUrl(source, body, 1, merged.length, list.length);
  const blind = explicit == null && list.length <= 50;
  let cursor = explicit ?? (blind ? withPage(source, 2) : null);
  let hops = 0;
  let previous = list.length;
  while (cursor && hops < HOP_CAP && merged.length < ITEM_CAP) {
    hops += 1;
    let pageBody: unknown = null;
    try {
      pageBody = await fetchPage(cursor);
    } catch {
      break;
    }
    if (pageBody == null) break;
    const pageHit = findCatalogList(pageBody);
    if (!pageHit || pageHit.list.length === 0) break;
    const added = take(pageHit.list);
    if (added === 0) break;
    const short = pageHit.list.length < previous;
    const page = hops + 1;
    const next = nextCatalogUrl(cursor, pageBody, page, merged.length, pageHit.list.length);
    if (short && !next) break;
    if (next) cursor = next;
    else if (blind && !short && pageHit.list.length >= 10) cursor = withPage(source, page + 1);
    else break;
    previous = pageHit.list.length;
  }
  if (merged.length === list.length && body === first) return first;
  const clone = structuredClone(body) as unknown;
  const cloned = findCatalogList(clone);
  if (!cloned) return first;
  cloned.parent[cloned.key] = merged;
  return clone;
}

function listedRows(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  return findCatalogList(body)?.list || [];
}

const BROWSE_WINDOW = 40;

function browseMatch(item: unknown, q: string) {
  if (!q) return true;
  const blob = JSON.stringify(item).toLowerCase();
  return q.split(/\s+/).filter(Boolean).every((part) => blob.includes(part));
}

function followingPage(source: URL, body: unknown, listLength: number, collected: number) {
  const current = Number(source.searchParams.get("page") || source.searchParams.get("p") || 1);
  const explicit = nextCatalogUrl(source, body, Number.isFinite(current) ? current : 1, collected, listLength);
  if (explicit) return explicit;
  if (listLength < 10 || listLength > 50) return null;
  const next = new URL(source);
  next.searchParams.delete("vl_from");
  const key = next.searchParams.has("p") && !next.searchParams.has("page") ? "p" : "page";
  const here = Number(next.searchParams.get(key) || "1");
  next.searchParams.set(key, String((Number.isFinite(here) ? here : 1) + 1));
  return next.href === source.href ? null : next;
}

export async function walkBrowse(options: {
  start: URL;
  first: unknown;
  from: number;
  q: string;
  fetchPage: (url: URL) => Promise<unknown | null>;
  limit?: number;
  extraHops?: number;
}) {
  const limit = options.limit ?? BROWSE_WINDOW;
  const q = options.q.trim().toLowerCase();
  const extraHops = q ? (options.extraHops ?? 10) : 0;
  const prepared = options.from > 0
    ? { source: options.start, body: options.first, list: listedRows(options.first) }
    : Array.isArray(options.first)
      ? { source: options.start, body: options.first, list: options.first }
      : await prepareCatalogBody(options.start, options.first, options.fetchPage);
  let source = prepared.source;
  let body = prepared.body;
  let list = prepared.list;
  let index = Math.max(0, options.from);
  const out: unknown[] = [];
  const seen = new Set<string>();
  let hops = 0;
  let stalled = false;
  const consume = () => {
    while (index < list.length && out.length < limit) {
      const item = list[index];
      index += 1;
      const stamp = catalogStamp(item);
      if (seen.has(stamp)) continue;
      seen.add(stamp);
      if (!browseMatch(item, q)) continue;
      out.push(item);
    }
  };
  consume();
  while (out.length < limit && index >= list.length && hops < extraHops) {
    const next = followingPage(source, body, list.length, Math.max(seen.size, list.length));
    if (!next) break;
    hops += 1;
    const pageBody = await options.fetchPage(next);
    const hit = pageBody ? findCatalogList(pageBody) : null;
    if (!hit || hit.list.length === 0) {
      stalled = true;
      break;
    }
    const before = seen.size;
    source = next;
    body = pageBody;
    list = hit.list;
    index = 0;
    consume();
    if (seen.size === before) {
      stalled = true;
      break;
    }
  }
  let nextCursor = "";
  if (!stalled && index < list.length) {
    const again = new URL(source);
    again.searchParams.set("vl_from", String(index));
    nextCursor = again.href;
  } else if (!stalled) {
    const next = followingPage(source, body, list.length, Math.max(seen.size, list.length));
    if (next) nextCursor = next.href;
  }
  const info = catalogMeta(body);
  return { items: out, total: info.total, page: info.page, lastPage: info.lastPage, nextCursor };
}
