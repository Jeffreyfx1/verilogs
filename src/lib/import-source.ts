/** Marketplace comes from the import the admin selected. Product text is never consulted. */

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
    const cost = Number(row.price ?? row.cost);
    const count = Number(row.stock ?? row.count ?? 0);
    if (!service || !Number.isFinite(cost) || !(cost > 0) || seen.has(service)) continue;
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
      count: Number.isFinite(count) && count > 0 ? Math.round(count) : 0,
    });
  }
  return { recognized: true, rows };
}

function priceInfoList(payload: unknown): Array<Record<string, unknown>> | null {
  if (Array.isArray(payload)) {
    const rows = payload.filter(priceInfoRow);
    return rows.length ? rows : null;
  }
  if (priceInfoRow(payload)) return [payload];
  if (!payload || typeof payload !== "object") return null;
  const bag = payload as Record<string, unknown>;
  for (const key of ["data", "services", "prices", "result", "items", "list"]) {
    if (!(key in bag)) continue;
    const found = priceInfoList(bag[key]);
    if (found) return found;
  }
  return null;
}

export function flattenGetaText(payload: unknown): Array<Record<string, unknown>> | null {
  const prices = readGetaTextPrices(payload);
  if (prices) return prices.rows.length ? prices.rows : null;
  if (!payload || typeof payload !== "object") return null;
  const rows: Array<Record<string, unknown>> = [];
  const push = (country: string, service: string, operator: string, quote: Record<string, unknown>) => {
    const cost = Number(quote.cost ?? quote.price ?? quote.retail_price);
    const count = Number(quote.count ?? quote.physicalCount ?? quote.stock ?? 0);
    if (!service || !Number.isFinite(cost) || cost <= 0) return;
    const row: Record<string, unknown> = {
      id: `${country}|${service}|${operator}`,
      name: service,
      service,
      country,
      operator,
      cost,
      count: Number.isFinite(count) ? count : 0,
    };
    const rate = quote.rate ?? quote.success_rate ?? quote.successRate;
    if (rate != null && rate !== "" && Number.isFinite(Number(rate))) row.rate = Number(rate);
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
      const nested = Object.entries(record).filter(([, value]) => value && typeof value === "object");
      if (nested.length) {
        shaped = true;
        for (const [operator, inner] of nested) {
          if (inner && typeof inner === "object") push(country, service, operator, inner as Record<string, unknown>);
        }
        continue;
      }
      if (Number.isFinite(Number(record.cost ?? record.price))) {
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
    blurb: "Products imported here appear only in Buy Logs. Add each API in the Logs API providers section.",
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
