/** Marketplace comes from the import the admin selected. Product text is never consulted. */
import { parseMoney } from "./money.ts";

export const IMPORT_TYPES = ["SMM_IMPORT", "NUMBER_IMPORT", "VPN_IMPORT", "RANDOM_IMPORT", "VTU_IMPORT", "USA_IMPORT"] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export type DestCategory = "smm" | "number" | "vpn" | "logs" | "airtime" | "data" | "usa";

export type ImportDestination = {
  importType: ImportType;
  category: DestCategory;
  serverId: string;
};

export const IMPORT_KINDS = ["smm", "numbers", "server2", "server3", "usa", "random", "vtu-airtime", "vtu-data", "vpn", "vtu"] as const;
export type SourceKind = (typeof IMPORT_KINDS)[number];

const DEST: Record<Exclude<SourceKind, "vpn" | "vtu">, ImportDestination> = {
  smm: { importType: "SMM_IMPORT", category: "smm", serverId: "" },
  numbers: { importType: "NUMBER_IMPORT", category: "number", serverId: "1" },
  server2: { importType: "NUMBER_IMPORT", category: "number", serverId: "2" },
  server3: { importType: "NUMBER_IMPORT", category: "number", serverId: "3" },
  usa: { importType: "USA_IMPORT", category: "usa", serverId: "usa" },
  random: { importType: "RANDOM_IMPORT", category: "logs", serverId: "" },
  "vtu-airtime": { importType: "VTU_IMPORT", category: "airtime", serverId: "" },
  "vtu-data": { importType: "VTU_IMPORT", category: "data", serverId: "" },
};

export function sourceKindOf(value: string | undefined): SourceKind | "" {
  return (IMPORT_KINDS as readonly string[]).includes(String(value)) ? (value as SourceKind) : "";
}

/** Null means the import must not create products (VPN coming soon, or an unsplit VTU pull). */
export function destinationOf(kind: string | undefined): ImportDestination | null {
  if (kind === "vpn" || kind === "vtu" || !kind) return null;
  return DEST[kind as keyof typeof DEST] || null;
}

function textField(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function moneyCost(raw: unknown): number | null {
  const n = parseMoney(raw);
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

/** A number, a numeric string, or a sum of area-code counts. Currency objects are not stock. */
function stockCount(raw: unknown): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 0 ? Math.round(raw) : 0;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return 0;
    const n = Number(trimmed.replace(/[,\s]/g, ""));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return 0;
  const rec = raw as Record<string, unknown>;
  if ("USD" in rec || "usd" in rec || "NGN" in rec || "ngn" in rec || "cost" in rec || "price" in rec || "Price" in rec) return 0;
  let sum = 0;
  let saw = false;
  for (const value of Object.values(rec)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      saw = true;
      if (value > 0) sum += value;
    } else if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      saw = true;
      const n = Number(value);
      if (n > 0) sum += n;
    }
  }
  return saw ? Math.round(sum) : 0;
}

function pickStock(row: Record<string, unknown>) {
  if ("stock" in row && row.stock != null) return stockCount(row.stock);
  if ("count" in row && row.count != null) return stockCount(row.count);
  if ("physicalCount" in row && row.physicalCount != null) return stockCount(row.physicalCount);
  return 0;
}

function isUsaAliasKey(key: string) {
  const normalized = key.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  return normalized === "usa" || normalized === "us" || normalized === "187" || normalized === "united states" || normalized === "united states of america";
}

function usaAlias(country: string) {
  const trimmed = country.trim();
  return trimmed && isUsaAliasKey(trimmed) ? "usa" : trimmed;
}

function serviceKey(key: string) {
  const trimmed = key.trim();
  if (!trimmed || isUsaAliasKey(trimmed) || /^\d+$/.test(trimmed)) return "";
  return /^[a-z0-9][a-z0-9._+-]{0,64}$/i.test(trimmed) ? trimmed : "";
}

/** `{ whatsapp: { price, stock } }` — not a country → service tree. */
function asServiceMap(payload: unknown): Array<Record<string, unknown>> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const entries = Object.entries(payload as Record<string, unknown>);
  if (!entries.length) return null;
  const rows: Array<Record<string, unknown>> = [];
  for (const [key, value] of entries) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const rec = value as Record<string, unknown>;
    const cost = moneyCost(rec.price ?? rec.cost ?? rec.retail_price);
    const nested = Object.values(rec).some((item) => item && typeof item === "object");
    if (!(cost != null && cost > 0)) {
      if (nested || isUsaAliasKey(key)) return null;
      continue;
    }
    const api = textField(rec, ["api_name", "apiName"]) || serviceKey(key);
    if (!api || (isUsaAliasKey(key) && !textField(rec, ["api_name", "apiName"]))) return null;
    rows.push({ ...rec, api_name: api });
  }
  return rows.length ? rows : null;
}

function priceInfoRow(row: unknown): row is Record<string, unknown> {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const rec = row as Record<string, unknown>;
  return typeof rec.api_name === "string" || typeof rec.apiName === "string" || typeof rec.service_name === "string" || typeof rec.serviceName === "string";
}

/** Documented GET /api/v1/prices-info rows. Null when this is not that shape. */
export function readGetaTextPrices(payload: unknown): { recognized: boolean; rows: Array<Record<string, unknown>> } | null {
  const listed = priceInfoList(payload);
  if (!listed) return null;
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const row of listed) {
    const service = textField(row, ["api_name", "apiName"]);
    const name = textField(row, ["service_name", "serviceName"]) || service;
    const cost = moneyCost(row.price ?? row.cost);
    const count = pickStock(row);
    if (!service || cost == null || seen.has(service)) continue;
    seen.add(service);
    rows.push({
      id: service,
      api_name: service,
      service_name: name,
      name,
      service,
      country: "usa",
      operator: "",
      cost,
      count,
    });
  }
  return { recognized: true, rows };
}

function priceInfoList(payload: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(payload)) {
    const rows = payload.filter(priceInfoRow);
    return rows.length ? rows : null;
  }
  if (!payload || typeof payload !== "object") return null;
  const bag = payload as Record<string, unknown>;
  for (const key of ["data", "services", "prices", "result", "items", "list"]) {
    if (!(key in bag)) continue;
    const found = priceInfoList(bag[key]);
    if (found) return found;
    const mapped = asServiceMap(bag[key]);
    if (mapped) return mapped;
  }
  if (priceInfoRow(payload)) return [payload];
  return asServiceMap(payload);
}

export function normalizeGetaTextPayload(payload: unknown): { recognized: boolean; rows: Array<Record<string, unknown>> } | null {
  const prices = readGetaTextPrices(payload);
  if (prices) return prices;
  const flat = flattenGetaText(payload);
  if (!flat?.length) return null;
  return { recognized: true, rows: flat };
}

export function flattenGetaText(payload: unknown): Array<Record<string, unknown>> | null {
  const prices = readGetaTextPrices(payload);
  if (prices) return prices.rows.length ? prices.rows : null;
  if (!payload || typeof payload !== "object") return null;
  const rows: Array<Record<string, unknown>> = [];
  const seen = new Map<string, Record<string, unknown>>();
  const push = (countryRaw: string, service: string, operator: string, quote: Record<string, unknown>) => {
    const cost = moneyCost(quote.cost ?? quote.price ?? quote.retail_price);
    if (!service || cost == null) return;
    const country = usaAlias(countryRaw) || "usa";
    const count = pickStock(quote);
    const key = `${country}|${service}|${operator}`.toLowerCase();
    const prev = seen.get(key);
    if (prev) {
      if (count > Number(prev.count || 0)) {
        prev.count = count;
        prev.cost = cost;
      }
      return;
    }
    const row: Record<string, unknown> = {
      id: `${country}|${service}|${operator}`,
      name: service,
      service,
      country,
      operator,
      cost,
      count,
    };
    const rate = quote.rate ?? quote.success_rate ?? quote.successRate;
    if (rate != null && rate !== "" && Number.isFinite(Number(rate))) row.rate = Number(rate);
    seen.set(key, row);
    rows.push(row);
  };
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      for (const [service, quote] of Object.entries(entry as Record<string, unknown>)) {
        if (quote && typeof quote === "object") push("usa", service, "any", quote as Record<string, unknown>);
      }
    }
    return rows.length ? rows : null;
  }
  let shaped = false;
  for (const [country, services] of Object.entries(payload as Record<string, unknown>)) {
    if (!services || typeof services !== "object" || Array.isArray(services)) continue;
    for (const [service, quote] of Object.entries(services as Record<string, unknown>)) {
      if (!quote || typeof quote !== "object" || Array.isArray(quote)) continue;
      const record = quote as Record<string, unknown>;
      const nested = Object.entries(record).filter(([, value]) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return false;
        const inner = value as Record<string, unknown>;
        return moneyCost(inner.cost ?? inner.price ?? inner.retail_price) != null;
      });
      if (nested.length) {
        shaped = true;
        for (const [operator, inner] of nested) {
          if (inner && typeof inner === "object") push(country, service, operator, inner as Record<string, unknown>);
        }
        continue;
      }
      if (moneyCost(record.cost ?? record.price) != null) {
        shaped = true;
        push(country, service, "any", record);
      }
    }
  }
  return shaped && rows.length ? rows : null;
}

export const IMPORT_CARDS = [
  {
    kind: "smm" as const,
    title: "Instaking · SMM",
    providerName: "Instaking",
    blurb: "Social media services from Instaking. They are filed as SMM and nowhere else.",
    url: "https://instaking.ng/api/v1",
    currency: "USD" as const,
    usdRate: 0,
    auth: "POST key and action=services. The key stays on the server. Balance reports the currency. A rate is per 1,000, except a package.",
  },
  {
    kind: "numbers" as const,
    title: "5sim · Server 1",
    providerName: "5sim",
    blurb: "Number import. Server 1 only.",
    url: "https://5sim.net/v1/guest/prices",
    currency: "USD" as const,
    usdRate: 2646,
    auth: "Guest price list. A key is not required for this URL.",
  },
  {
    kind: "server2" as const,
    title: "Number API · Server 2",
    providerName: "Server 2",
    blurb: "Separate number slot. It does not change 5sim.",
    url: "",
    currency: "USD" as const,
    usdRate: 0,
    auth: "Add this provider's own URL, key and request method.",
  },
  {
    kind: "server3" as const,
    title: "Number API · Server 3",
    providerName: "Server 3",
    blurb: "Another number slot. Server 1 and Server 2 stay untouched.",
    url: "",
    currency: "USD" as const,
    usdRate: 0,
    auth: "Add this provider's own URL and key.",
  },
  {
    kind: "usa" as const,
    title: "GetaText · USA",
    providerName: "GetaText",
    blurb: "USA services only. Not mixed into Server 1, 2 or 3.",
    url: "https://getatext.com/api/v1/prices-info",
    currency: "USD" as const,
    usdRate: 0,
    auth: "GET /api/v1/prices-info. The key is sent only in the Auth header. No request body. rent-a-number is never called while importing.",
  },
  {
    kind: "random" as const,
    title: "Logs import",
    providerName: "Logs",
    blurb: "Products imported here appear only in Logs / VPN. Add each API in the Logs API providers section.",
    url: "",
    currency: "USD" as const,
    usdRate: 0,
    auth: "AccsZone is the documented logs catalogue. Configure it below. Credentials are not stored on the product.",
  },
  {
    kind: "vtu-airtime" as const,
    title: "Airtime networks",
    providerName: "Airtime",
    blurb: "Airtime is not imported. Add each network and the provider's own network id under Airtime networks.",
    url: "",
    currency: "NGN" as const,
    usdRate: 0,
    auth: "SMEAPI airtime is POST /api/airtime/ with Authorization: Token. That address is a purchase, so import never calls it.",
  },
  {
    kind: "vtu-data" as const,
    title: "SMEAPI · Data",
    providerName: "SMEAPI Data",
    blurb: "Data plans only. Airtime is a separate import.",
    url: "https://smeapi.com.ng/api/dataplans/",
    currency: "NGN" as const,
    usdRate: 0,
    auth: "GET https://smeapi.com.ng/api/dataplans/ with Authorization: Token.",
  },
];
