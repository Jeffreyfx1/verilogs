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

export function flattenGetaText(payload: unknown): Array<Record<string, unknown>> | null {
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
    title: "SMM Import",
    providerName: "SMM",
    blurb: "Social media services. They are filed as SMM and nowhere else.",
    url: "",
    currency: "USD" as const,
    usdRate: 0,
    auth: "Paste this provider's catalogue URL and key. There is no preset vendor.",
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
    url: "https://getatext.com/stubs/handler_api.php?action=getPrices",
    currency: "USD" as const,
    usdRate: 0,
    auth: "Documented auth header is Auth. Add your key before importing.",
  },
  {
    kind: "random" as const,
    title: "AcctGlobe · Random",
    providerName: "AcctGlobe",
    blurb: "Random import. Customers see these as Logs in Marketplace.",
    url: "",
    currency: "NGN" as const,
    usdRate: 0,
    auth: "No public catalogue URL is hardcoded. Paste AcctGlobe's catalogue URL.",
  },
  {
    kind: "vtu-airtime" as const,
    title: "SMEAPI · Airtime",
    providerName: "SMEAPI Airtime",
    blurb: "Airtime only. Data, electricity and TV are not imported.",
    url: "https://smeapi.com.ng/api/dataplans/",
    currency: "NGN" as const,
    usdRate: 0,
    auth: "Networks come from the data-plan list. The customer chooses the airtime amount. Purchase uses Authorization: Token.",
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
