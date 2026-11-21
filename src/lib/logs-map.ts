import { formatLabels } from "@/lib/account-delivery";

export type FieldMap = {
  id: string;
  name: string;
  description: string;
  image: string;
  category: string;
  subcategory: string;
  price: string;
  stock: string;
  items: string;
};

export type PageMap = {
  mode: "none" | "page";
  pageParam: string;
  pageStart: number;
  lastPagePath: string;
  itemsPath: string;
};

export type MappedLog = {
  externalId: string;
  name: string;
  description: string;
  imageUrl: string;
  category: string;
  subcategory: string;
  price: number;
  stock: number;
};

const SECRET = /password|passwd|cookie|session|token|secret|credential|otp|2fa|auth.?key/i;
const BLOCKED_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|\[?::1\]?|metadata|metadata\.google)/i;
const IMAGE_KEYS = ["image", "image_url", "imageUrl", "logo", "logo_url", "logoUrl", "icon", "icon_url", "iconUrl", "thumbnail", "thumb", "picture", "photo", "avatar", "img", "src"];
const NESTS = ["category", "subcategory", "service", "platform", "group"];
const NOT_IMAGE = /\.(html?|php|json|xml|pdf|zip|csv|txt)(\?|$)/i;

export const ACCSZONE_MAP: FieldMap = {
  id: "id",
  name: "title",
  description: "description",
  image: "category.image",
  category: "category.title",
  subcategory: "subcategory.title",
  price: "price",
  stock: "available_stock",
  items: "data",
};

export const ACCSZONE_PAGE: PageMap = {
  mode: "page",
  pageParam: "page",
  pageStart: 1,
  lastPagePath: "meta.last_page",
  itemsPath: "data",
};

export function defaultFieldMap(): FieldMap {
  return { ...ACCSZONE_MAP };
}

export function defaultPageMap(): PageMap {
  return { ...ACCSZONE_PAGE, mode: "none" };
}

export function cleanFieldMap(input: unknown): FieldMap {
  const base = defaultFieldMap();
  if (!input || typeof input !== "object") return base;
  const row = input as Record<string, unknown>;
  const path = (key: keyof FieldMap) => {
    const value = String(row[key] ?? base[key]).trim().slice(0, 80);
    if (!value || SECRET.test(value)) return base[key];
    if (!/^[A-Za-z0-9_.[\]]+$/.test(value)) return base[key];
    return value;
  };
  return {
    id: path("id"),
    name: path("name"),
    description: path("description"),
    image: path("image"),
    category: path("category"),
    subcategory: path("subcategory"),
    price: path("price"),
    stock: path("stock"),
    items: path("items"),
  };
}

export function cleanPageMap(input: unknown): PageMap {
  const base = defaultPageMap();
  if (!input || typeof input !== "object") return base;
  const row = input as Record<string, unknown>;
  const mode = row.mode === "page" ? "page" : "none";
  const pageParam = String(row.pageParam || base.pageParam).replace(/[^A-Za-z0-9_]/g, "").slice(0, 40) || "page";
  const lastPagePath = String(row.lastPagePath || "").trim();
  const itemsPath = String(row.itemsPath || row.items || base.itemsPath).trim();
  return {
    mode,
    pageParam,
    pageStart: Math.max(0, Math.round(Number(row.pageStart) || base.pageStart)),
    lastPagePath: lastPagePath && /^[A-Za-z0-9_.]+$/.test(lastPagePath) ? lastPagePath.slice(0, 80) : base.lastPagePath,
    itemsPath: itemsPath && /^[A-Za-z0-9_.]+$/.test(itemsPath) ? itemsPath.slice(0, 80) : base.itemsPath,
  };
}

export function dig(source: unknown, path: string): unknown {
  if (!path) return undefined;
  let cursor: unknown = source;
  for (const part of path.split(".").filter(Boolean)) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

function textOf(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
}

function imageText(value: unknown): string {
  const direct = textOf(value);
  if (direct) return direct;
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const record = value as Record<string, unknown>;
  for (const key of ["url", "src", "href", "path", "image", "logo", "icon"]) {
    const nested = textOf(record[key]);
    if (nested) return nested;
  }
  return "";
}

/** HTTPS logo from the provider. Extensionless CDN paths are kept. Documents and private URLs are not. */
export function publicImage(value: string) {
  const raw = value.trim();
  if (!raw || /\s/.test(raw)) return "";
  if (!/^https:\/\//i.test(raw)) return "";
  try {
    const url = new URL(raw);
    if (BLOCKED_HOST.test(url.hostname) || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) return "";
    if (NOT_IMAGE.test(url.pathname)) return "";
    return url.toString().slice(0, 400);
  } catch {
    return "";
  }
}

/** Prefer the mapped field, then any logo the provider actually returned. */
export function logoFromRecord(record: Record<string, unknown>, preferredPath = ""): string {
  const preferred = preferredPath ? publicImage(imageText(dig(record, preferredPath))) : "";
  if (preferred) return preferred;
  for (const key of IMAGE_KEYS) {
    const hit = publicImage(imageText(record[key]));
    if (hit) return hit;
  }
  for (const nest of NESTS) {
    const child = record[nest];
    if (!child || typeof child !== "object" || Array.isArray(child)) continue;
    const box = child as Record<string, unknown>;
    for (const key of IMAGE_KEYS) {
      const hit = publicImage(imageText(box[key]));
      if (hit) return hit;
    }
  }
  return "";
}

export function inheritLogos<T extends { imageUrl: string; group: string }>(items: T[]): T[] {
  const byGroup = new Map<string, string>();
  for (const item of items) {
    const group = item.group.trim().toLowerCase();
    if (item.imageUrl && group && !byGroup.has(group)) byGroup.set(group, item.imageUrl);
  }
  return items.map((item) => {
    if (item.imageUrl) return item;
    const group = item.group.trim().toLowerCase();
    const shared = group ? byGroup.get(group) || "" : "";
    return shared ? { ...item, imageUrl: shared } : item;
  });
}

function safeDescription(value: string) {
  const text = value.replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!text) return "";
  const labels = formatLabels(text);
  const format = labels.length >= 2 ? `Account format: ${labels.join(" : ")}`.slice(0, 300) : "";
  if (SECRET.test(text) || (text.match(/[^\s:]+:[^\s:]{4,}/g) || []).length >= 2) return format;
  return text;
}

export function mapLogProducts(payload: unknown, fields: FieldMap): MappedLog[] {
  const listPath = fields.items || "data";
  const listed = dig(payload, listPath);
  const rows = Array.isArray(listed) ? listed : Array.isArray(payload) ? payload : [];
  const out: MappedLog[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    if (Object.keys(record).some((key) => SECRET.test(key) && record[key] && typeof record[key] !== "object")) continue;
    const externalId = textOf(dig(record, fields.id)).slice(0, 80);
    const name = textOf(dig(record, fields.name)).slice(0, 180);
    if (!externalId || !name) continue;
    const price = Number(textOf(dig(record, fields.price)).replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(price) || price < 0) continue;
    const stock = Math.max(0, Math.round(Number(textOf(dig(record, fields.stock))) || 0));
    out.push({
      externalId,
      name,
      description: safeDescription(textOf(dig(record, fields.description))),
      imageUrl: logoFromRecord(record, fields.image),
      category: textOf(dig(record, fields.category)).slice(0, 80),
      subcategory: textOf(dig(record, fields.subcategory)).slice(0, 80),
      price,
      stock,
    });
  }
  const withLogos = inheritLogos(out.map((row) => ({ ...row, group: row.category })));
  return withLogos.map(({ group: _group, ...row }) => row);
}

export function lastPageOf(payload: unknown, page: PageMap) {
  const value = Number(dig(payload, page.lastPagePath));
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** Rejects private, loopback and non-HTTPS targets before a provider request. */
export function publicHttpsUrl(base: string, path: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    const root = new URL(base);
    url = path.startsWith("http") ? new URL(path) : new URL(path.replace(/^\//, ""), root.href.endsWith("/") ? root.href : root.href + "/");
  } catch {
    return { ok: false, error: "Enter a valid HTTPS API URL." };
  }
  if (url.protocol !== "https:") return { ok: false, error: "Provider URLs must use HTTPS." };
  if (url.username || url.password) return { ok: false, error: "Put the API key in the key field, not in the URL." };
  if (BLOCKED_HOST.test(url.hostname) || url.hostname.endsWith(".local") || url.hostname.endsWith(".internal")) {
    return { ok: false, error: "That address is not a public provider API." };
  }
  return { ok: true, url };
}
