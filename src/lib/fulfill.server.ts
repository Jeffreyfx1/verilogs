import { nairaCost, type Product, type Provider } from "@/lib/catalog";
import { instakingOrderFields, instakingPost, isInstakingHost, readSmmDetail } from "@/lib/instaking";
import { easternWallToIso } from "@/lib/number-live";
import { SMM_CLOSED, smmSalesOpen } from "@/lib/purchase-history";

export type Placement =
  | { ok: true; phone: string; ref: string; waiting: boolean; cost: number; delivery?: string; providerRef?: string; expiresAt?: string }
  | { ok: false; error: string };

const FIVE: Record<string, string> = {
  "united kingdom": "england",
  "united states": "usa",
  "united arab emirates": "uae",
  "south africa": "southafrica",
  "hong kong": "hongkong",
  "ivory coast": "ivorycoast",
  "saudi arabia": "saudiarabia",
  "sri lanka": "srilanka",
  czechia: "czech",
};

const NETWORK_BRANDS = new Set(["mtn", "glo", "airtel", "9mobile", "9 mobile", "etisalat", "t2", "t2mobile", "smile"]);

function originOf(base: string) {
  try {
    return new URL(base).origin;
  } catch {
    return "";
  }
}

function fiveCountry(label: string) {
  const key = label.trim().toLowerCase();
  return FIVE[key] || key.replace(/[^a-z]/g, "");
}

export function planValue(externalId: string): string | number {
  const last = String(externalId || "").split("|").pop() || "";
  if (/^\d+$/.test(last)) return Number(last);
  return last;
}

export function networkValue(product: { operator?: string; network?: string }, _host = ""): string | number {
  const operator = String(product.operator || "").trim();
  if (/^\d+$/.test(operator)) return Number(operator);
  const low = operator.toLowerCase();
  if (operator && !NETWORK_BRANDS.has(low)) return operator;
  return 0;
}

function purchaseRef(clientReference?: string) {
  const safe = String(clientReference || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 40);
  return safe ? `VL${safe}` : `VL${Date.now().toString(36)}`;
}

async function readBody(res: Response) {
  const text = await res.text();
  try {
    return { text, json: JSON.parse(text) as Record<string, unknown> };
  } catch {
    return { text, json: {} as Record<string, unknown> };
  }
}

export async function placeOnProvider(input: { product: Product; provider: Provider; apiKey: string; phone: string; amount: number; detail?: string; clientReference?: string }): Promise<Placement> {
  const { product, provider, apiKey } = input;
  if (!apiKey) return { ok: false, error: "This API has no key saved, so the order was not sent and the wallet was not charged." };
  const host = (() => {
    try {
      return new URL(provider.baseUrl).hostname;
    } catch {
      return "";
    }
  })();
  const five = host.endsWith("5sim.net") || /5sim/i.test(provider.name);
  const sme = host.endsWith("smeapi.com.ng");
  const cost = product.variable ? input.amount : nairaCost(product.cost, provider.currency, provider.usdRate);
  const numberCategory = product.category === "number" || product.category === "numbers" || product.category === "rent";

  if (isInstakingHost(host) && product.category === "smm") {
    if (!smmSalesOpen()) return { ok: false, error: SMM_CLOSED };
    const fields = readSmmDetail(input.detail || "", 0);
    const built = instakingOrderFields(product.smmType || product.operator || "Default", product.externalId || product.service, fields);
    if ("error" in built && built.error) return { ok: false, error: built.error };
    const sent = await instakingPost(apiKey, built);
    if (!sent.ok) return { ok: false, error: sent.error || "Instaking refused the order. The wallet was not charged." };
    const order = sent.body && typeof sent.body === "object" ? (sent.body as { order?: unknown }).order : "";
    if (order == null || order === "") return { ok: false, error: "Instaking did not return an order id. The wallet was not charged." };
    const type = product.smmType || product.operator || "";
    const packaged = /^package$/i.test(type);
    const subscription = /subscription/i.test(type);
    const comments = /custom comments/i.test(type);
    let units = 1;
    if (subscription) units = Math.max(1, Math.round(Number(fields.max) || 1)) * Math.max(1, Math.round(Number(fields.posts) || 1));
    else if (comments) units = Math.max(1, String(fields.comments || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length);
    else if (!packaged) units = Math.max(1, Math.round(Number(fields.quantity) || 1));
    return { ok: true, phone: "", ref: String(order), waiting: true, cost: nairaCost(product.cost, provider.currency, provider.usdRate) * units };
  }

  if (five && numberCategory) {
    const country = fiveCountry(product.country);
    const operator = (product.operator || "any").toLowerCase().replace(/[^a-z0-9]/g, "") || "any";
    const service = (product.service || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!country || !service) return { ok: false, error: "This number is missing a country or service, so it was not sent." };
    const url = `https://5sim.net/v1/user/buy/activation/${country}/${operator}/${service}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: "Bearer " + apiKey, Accept: "application/json" } });
    } catch {
      return { ok: false, error: "The number API could not be reached. The wallet was not charged." };
    }
    const { text, json } = await readBody(res);
    const phone = typeof json.phone === "string" ? json.phone : "";
    if (!res.ok || !phone || /<!doctype|<html/i.test(text)) {
      if (/<!doctype|<html|cloudflare/i.test(text)) return { ok: false, error: "The number service is temporarily unavailable. The wallet was not charged." };
      const raw = String(json.message || text || "The number service refused the order.").slice(0, 180);
      if (/balance|funds|money/i.test(raw)) return { ok: false, error: "The API wallet is empty. Top up that API, then try again." };
      return { ok: false, error: raw || "The number service refused the order. The wallet was not charged." };
    }
    return { ok: true, phone, ref: String(json.id || ""), waiting: true, cost, providerRef: String(json.id || ""), expiresAt: typeof json.expires === "string" ? json.expires : "" };
  }

  if (/(^|\.)getatext\.com$/i.test(host) && product.category === "usa") {
    const service = String(product.service || "").trim().toLowerCase();
    if (!service) return { ok: false, error: "This USA service has no service id, so it was not sent." };
    let res: Response;
    try {
      res = await fetch("https://getatext.com/api/v1/rent-a-number", {
        method: "POST",
        headers: { Auth: apiKey, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ service }),
      });
    } catch {
      return { ok: false, error: "The number service could not be reached. The wallet was not charged." };
    }
    const { text, json } = await readBody(res);
    if (!res.ok || json.errors || /<!doctype|<html/i.test(text)) {
      if (/<!doctype|<html|cloudflare/i.test(text)) return { ok: false, error: "The number service is temporarily unavailable. The wallet was not charged." };
      const raw = String(json.errors || json.message || "").slice(0, 180);
      return { ok: false, error: raw || "The number service refused the order. The wallet was not charged." };
    }
    const phone = String(json.number || "");
    if (!phone) return { ok: false, error: "The number service did not return a number. The wallet was not charged." };
    return { ok: true, phone, ref: String(json.id || ""), waiting: true, cost, providerRef: String(json.id || ""), expiresAt: easternWallToIso(json.end_time) };
  }

  if (sme && product.category === "airtime") {
    return { ok: false, error: "Airtime is sold from the network list, not from an imported product. Nothing was sent." };
  }

  if (sme && product.category === "data") {
    const phone = input.phone.trim();
    if (phone.length < 8) return { ok: false, error: "Enter the phone number." };
    const network = networkValue(product, host);
    if (network === "" || network === 0) return { ok: false, error: "This plan has no network id, so it was not sent." };
    const ref = purchaseRef(input.clientReference);
    const plan = planValue(product.externalId);
    const body = { network, phone, data_plan: plan, ref, ported_number: "false" };
    if (plan === "" || plan === 0) return { ok: false, error: "This data plan has no plan id, so it was not sent." };
    const url = originOf(provider.baseUrl) + "/api/data/";
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: "Token " + apiKey, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, error: "The VTU API could not be reached. The wallet was not charged." };
    }
    const { text, json } = await readBody(res);
    const status = String(json.status || json.Status || "").toLowerCase();
    if (!res.ok || status === "fail" || status === "failed" || status === "error" || json.success === false) {
      const raw = String(json.message || json.msg || json.error || text || "The VTU API refused the order.").slice(0, 180);
      if (/balance|funds|wallet/i.test(raw)) return { ok: false, error: "The API wallet is empty. Top up that API, then try again." };
      return { ok: false, error: raw || "The VTU API refused the order. The wallet was not charged." };
    }
    return { ok: true, phone, ref: String(json.ident || json.ref || ref), waiting: false, cost };
  }

  if (/(^|\.)accszone\.com$/i.test(host) && (product.category === "logs" || product.category === "vpn")) {
    const adId = Number(product.externalId);
    if (!Number.isInteger(adId) || adId <= 0) return { ok: false, error: "This listing has no AccsZone id, so it was not sent." };
    let res: Response;
    try {
      res = await fetch("https://accszone.com/api/v1/purchase", {
        method: "POST",
        headers: { "X-API-Key": apiKey, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ ad_id: adId, quantity: 1, client_reference: input.clientReference || undefined }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      return { ok: false, error: "AccsZone could not be reached. The wallet was not charged." };
    }
    const { text, json } = await readBody(res);
    const data = json.data && typeof json.data === "object" ? json.data as Record<string, unknown> : json;
    const accounts = Array.isArray(data.accounts) ? data.accounts.map((item) => String(item)).filter(Boolean) : [];
    if (!res.ok || !accounts.length) {
      const raw = String(json.message || data.message || text || "AccsZone refused the order.").replace(/accounts?/gi, "order").slice(0, 180);
      return { ok: false, error: raw || "AccsZone refused the order. The wallet was not charged." };
    }
    const orderId = String(data.order_id || "");
    return { ok: true, phone: "", ref: accounts.join("\n"), waiting: false, cost, delivery: accounts.join("\n"), providerRef: orderId };
  }

  return { ok: false, error: "This API is connected for prices, but the buy call is not set yet. The wallet was not charged." };
}
