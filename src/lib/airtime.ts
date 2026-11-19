/** Airtime is an amount-based network, not a catalogue product. */

export const AIRTIME_IMPORT_STOP = "Airtime is not a catalogue. Add the network under Airtime networks. Nothing was called and nothing was saved.";

export type AirtimeRouteConfig = {
  providerNetworkId: string;
  purchasePath: string;
  authHeader: string;
  authPrefix: string;
  networkField: string;
  phoneField: string;
  amountField: string;
  refField: string;
  extra: Record<string, string>;
};

export type AirtimeNetworkRecord = {
  id: string;
  brand: string;
  name: string;
  imageUrl: string;
  enabled: boolean;
  minAmount: number;
  maxAmount: number;
  profitNaira: number | null;
};

export type AirtimeRouteRecord = AirtimeRouteConfig & {
  id: string;
  networkId: string;
  providerId: string;
  enabled: boolean;
};

export type AirtimeOffer = {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  minAmount: number;
  maxAmount: number;
  profit: number;
};

const BUILT_IN = new Set(["mtn", "airtel", "glo", "9mobile"]);

export function isBuiltInAirtimeBrand(brand: string) {
  return BUILT_IN.has(brand);
}

export function airtimeBrand(name: string) {
  const low = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (low === "mtn") return "mtn";
  if (low === "airtel") return "airtel";
  if (low === "glo" || low === "globacom") return "glo";
  if (low === "9mobile" || low === "etisalat" || low === "t2" || low === "t2mobile") return "9mobile";
  return low.slice(0, 40);
}

export function isAirtimePurchaseAddress(raw: string) {
  try {
    return /\/airtime\/?$/i.test(new URL(raw).pathname);
  } catch {
    return false;
  }
}

/** Import and connection tests must stop before any request. */
export function airtimeImportBlock(kind: string, url: string) {
  if (kind === "vtu-airtime" || kind === "airtime") return AIRTIME_IMPORT_STOP;
  if (url && isAirtimePurchaseAddress(url)) return "That address buys airtime. Catalogue import will not call it, and no products were saved.";
  return null;
}

export function withoutAirtimeProducts<T extends { category: string }>(items: T[]) {
  return items.filter((item) => item.category !== "airtime");
}

export function safeImageUrl(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString().slice(0, 400);
  } catch {
    return "";
  }
}

export function typedNetworkId(raw: string): string | number | null {
  const id = String(raw || "").trim();
  if (!id || id.length > 40) return null;
  if (/^\d+$/.test(id)) return Number(id);
  return id;
}

export function airtimeCharge(face: number, profit: number) {
  const amount = Math.round(Number(face) || 0);
  const extra = Math.round(Number(profit) || 0);
  if (!(amount > 0)) return { ok: false as const, error: "Enter an amount." };
  if (extra < 0) return { ok: false as const, error: "Profit cannot be negative." };
  return { ok: true as const, charge: amount + extra, profit: extra, face: amount };
}

export function suggestedAirtimeRoute(baseUrl: string): AirtimeRouteConfig | null {
  let host = "";
  try {
    host = new URL(baseUrl).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  if (host !== "smeapi.com.ng" && !host.endsWith(".smeapi.com.ng")) return null;
  return {
    providerNetworkId: "",
    purchasePath: "/api/airtime/",
    authHeader: "Authorization",
    authPrefix: "Token",
    networkField: "network",
    phoneField: "phone",
    amountField: "amount",
    refField: "ref",
    extra: { ported_number: "false" },
  };
}

function originOf(base: string) {
  try {
    return new URL(base).origin;
  } catch {
    return "";
  }
}

export function airtimePurchaseUrl(baseUrl: string, purchasePath: string) {
  const path = String(purchasePath || "").trim();
  if (!path) return null;
  const origin = originOf(baseUrl);
  let url: URL;
  try {
    url = /^https?:\/\//i.test(path) ? new URL(path) : new URL(path, origin || undefined);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (origin && url.origin !== origin) return null;
  if (/dataplans|prices-info|get-services|handler_api|\/prices\b|catalogue|catalog/i.test(url.pathname)) return null;
  if (/[?&](api[_-]?key|token|secret|auth)=/i.test(url.search)) return null;
  return url.toString();
}

export function airtimeAuthHeader(name: string, prefix: string, apiKey: string) {
  const header = String(name || "").trim();
  const key = String(apiKey || "");
  if (!/^[\w-]{1,40}$/.test(header) || !key) return null;
  const lead = String(prefix || "").trim();
  if (lead && !/^[\w.-]{1,20}$/.test(lead)) return null;
  return { [header]: lead ? `${lead} ${key}` : key };
}

export function airtimePurchaseBody(config: AirtimeRouteConfig, input: { phone: string; amount: number; ref: string }) {
  const network = typedNetworkId(config.providerNetworkId);
  if (network == null) return null;
  const fields = {
    network: config.networkField.trim() || "network",
    phone: config.phoneField.trim() || "phone",
    amount: config.amountField.trim() || "amount",
    ref: config.refField.trim() || "ref",
  };
  const body: Record<string, string | number> = {
    [fields.network]: network,
    [fields.phone]: input.phone.trim(),
    [fields.amount]: Math.round(input.amount),
    [fields.ref]: input.ref,
  };
  for (const [key, value] of Object.entries(config.extra || {})) {
    if (!/^[\w-]{1,40}$/.test(key)) continue;
    body[key] = String(value).slice(0, 40);
  }
  return body;
}

export function prepareAirtimePurchase(input: {
  baseUrl: string;
  apiKey: string;
  route: AirtimeRouteConfig;
  phone: string;
  amount: number;
  ref: string;
}) {
  const network = typedNetworkId(input.route.providerNetworkId);
  if (network == null) return { ok: false as const, error: "This network has no provider id yet, so it was not sent." };
  const url = airtimePurchaseUrl(input.baseUrl, input.route.purchasePath);
  if (!url) return { ok: false as const, error: "This network has no purchase address yet, so it was not sent." };
  const headers = airtimeAuthHeader(input.route.authHeader, input.route.authPrefix, input.apiKey);
  if (!headers) return { ok: false as const, error: "This network has no API key, so it was not sent." };
  const body = airtimePurchaseBody(input.route, input);
  if (!body) return { ok: false as const, error: "This network has no provider id yet, so it was not sent." };
  return { ok: true as const, url, headers, body, network };
}

export function airtimeOffers(
  networks: AirtimeNetworkRecord[],
  routes: AirtimeRouteRecord[],
  providers: Array<{ id: string; enabled: boolean; baseUrl: string }>,
  fallbackProfit: number,
): AirtimeOffer[] {
  const profit = Math.max(0, Math.round(Number(fallbackProfit) || 0));
  const offers: AirtimeOffer[] = [];
  for (const network of networks) {
    if (!network.enabled) continue;
    const ready = routes.filter((route) => {
      if (!route.enabled || route.networkId !== network.id) return false;
      if (typedNetworkId(route.providerNetworkId) == null) return false;
      const provider = providers.find((item) => item.id === route.providerId && item.enabled);
      if (!provider) return false;
      return !!airtimePurchaseUrl(provider.baseUrl, route.purchasePath);
    });
    if (ready.length !== 1) continue;
    offers.push({
      id: network.id,
      name: network.name,
      brand: network.brand,
      imageUrl: network.imageUrl,
      minAmount: network.minAmount,
      maxAmount: network.maxAmount,
      profit: network.profitNaira == null ? profit : network.profitNaira,
    });
  }
  return offers;
}

export async function sendAirtimePurchase(
  prepared: { url: string; headers: Record<string, string>; body: Record<string, string | number> },
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
) {
  let res: Response;
  try {
    res = await fetchImpl(prepared.url, {
      method: "POST",
      headers: { ...prepared.headers, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(prepared.body),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return { ok: false as const, error: "The airtime API could not be reached. The wallet was not charged." };
  }
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = {};
  }
  const status = String(json.status || json.Status || "").toLowerCase();
  if (!res.ok || status === "fail" || status === "failed" || status === "error" || json.success === false) {
    const raw = scrubProviderText(String(json.message || json.msg || json.error || text || "The airtime API refused the order."), apiKey);
    if (/balance|funds|wallet/i.test(raw)) return { ok: false as const, error: "The API wallet is empty. Top up that API, then try again." };
    return { ok: false as const, error: raw || "The airtime API refused the order. The wallet was not charged." };
  }
  return { ok: true as const, ref: String(json.ident || json.ref || json.id || "") };
}

export function scrubProviderText(text: string, secret: string) {
  const raw = String(text || "").slice(0, 180);
  if (!secret) return raw;
  return raw.split(secret).join("").trim();
}
