import { getSql } from "@/lib/db";
import { uid } from "@/lib/money";
import {
  airtimeBrand,
  isBuiltInAirtimeBrand,
  safeImageUrl,
  typedNetworkId,
  type AirtimeNetworkRecord,
  type AirtimeRouteRecord,
} from "@/lib/airtime";

function extraOf(raw: string) {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const extra: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed).slice(0, 8)) {
      if (!/^[\w-]{1,40}$/.test(key)) continue;
      extra[key] = String(value ?? "").slice(0, 40);
    }
    return extra;
  } catch {
    return {};
  }
}

function networkOf(row: Record<string, unknown>): AirtimeNetworkRecord {
  return {
    id: String(row.id || ""),
    brand: String(row.brand || ""),
    name: String(row.name || ""),
    imageUrl: String(row.image_url || ""),
    enabled: row.enabled === true || row.enabled === "t" || row.enabled === "true",
    minAmount: Math.round(Number(row.min_amount) || 0),
    maxAmount: Math.round(Number(row.max_amount) || 0),
    profitNaira: row.profit_naira == null || row.profit_naira === "" ? null : Math.round(Number(row.profit_naira)),
  };
}

function routeOf(row: Record<string, unknown>): AirtimeRouteRecord {
  return {
    id: String(row.id || ""),
    networkId: String(row.network_id || ""),
    providerId: String(row.provider_id || ""),
    providerNetworkId: String(row.provider_network_id || ""),
    purchasePath: String(row.purchase_path || ""),
    authHeader: String(row.auth_header || "Authorization"),
    authPrefix: String(row.auth_prefix || ""),
    networkField: String(row.network_field || "network"),
    phoneField: String(row.phone_field || "phone"),
    amountField: String(row.amount_field || "amount"),
    refField: String(row.ref_field || "ref"),
    extra: extraOf(String(row.extra_json || "{}")),
    enabled: row.enabled === true || row.enabled === "t" || row.enabled === "true",
  };
}

export async function listAirtimeRecords() {
  const sql = await getSql();
  const networks = await sql.query<Record<string, unknown>>("select * from shop_airtime_networks order by sort_order, name");
  const routes = await sql.query<Record<string, unknown>>("select * from shop_airtime_routes order by created_at");
  return { networks: networks.map(networkOf), routes: routes.map(routeOf) };
}

export async function saveAirtimeNetworkRow(input: {
  id?: string;
  name: string;
  imageUrl?: string;
  enabled: boolean;
  minAmount: number;
  maxAmount: number;
  profitNaira: number | null;
}) {
  const name = input.name.trim().slice(0, 40);
  const brand = airtimeBrand(name);
  if (!name || !brand) return { error: "Enter the network name." };
  const minAmount = Math.round(input.minAmount);
  const maxAmount = Math.round(input.maxAmount);
  if (minAmount < 1 || maxAmount < minAmount || maxAmount > 1_000_000) return { error: "Check the minimum and maximum amounts." };
  if (input.profitNaira != null && (!Number.isFinite(input.profitNaira) || input.profitNaira < 0)) return { error: "Profit cannot be negative." };
  const sql = await getSql();
  const imageUrl = safeImageUrl(input.imageUrl || "");
  const profit = input.profitNaira == null ? null : Math.round(input.profitNaira);
  const id = String(input.id || "").trim();
  if (id) {
    const current = await sql.query<Record<string, unknown>>("select * from shop_airtime_networks where id = $1", [id]);
    if (!current[0]) return { error: "That network was not found." };
    const keptBrand = isBuiltInAirtimeBrand(String(current[0].brand || "")) ? String(current[0].brand) : brand;
    await sql.query(
      `update shop_airtime_networks
       set name = $2, brand = $3, image_url = $4, enabled = $5, min_amount = $6, max_amount = $7, profit_naira = $8, updated_at = now()
       where id = $1`,
      [id, name, keptBrand, imageUrl, input.enabled, minAmount, maxAmount, profit],
    );
    return { error: null as string | null, id };
  }
  const existing = await sql.query<{ id: string }>("select id from shop_airtime_networks where brand = $1", [brand]);
  if (existing[0]) return { error: "That network already exists. Edit it instead." };
  const created = uid("air");
  await sql.query(
    `insert into shop_airtime_networks (id, brand, name, image_url, enabled, min_amount, max_amount, profit_naira, sort_order)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 100)`,
    [created, brand, name, imageUrl, input.enabled, minAmount, maxAmount, profit],
  );
  return { error: null as string | null, id: created };
}

export async function saveAirtimeRouteRow(input: AirtimeRouteRecord) {
  if (!input.networkId || !input.providerId) return { error: "Choose the network and the provider." };
  if (input.enabled && typedNetworkId(input.providerNetworkId) == null) return { error: "Enter the provider network id before turning this route on. It is not guessed." };
  if (input.enabled && !input.purchasePath.trim()) return { error: "Enter the purchase path before turning this route on." };
  const sql = await getSql();
  const network = await sql.query<{ id: string }>("select id from shop_airtime_networks where id = $1", [input.networkId]);
  if (!network[0]) return { error: "That network was not found." };
  const values = [
    input.providerNetworkId.trim().slice(0, 40),
    input.purchasePath.trim().slice(0, 200),
    input.authHeader.trim().slice(0, 40) || "Authorization",
    input.authPrefix.trim().slice(0, 20),
    input.networkField.trim().slice(0, 40) || "network",
    input.phoneField.trim().slice(0, 40) || "phone",
    input.amountField.trim().slice(0, 40) || "amount",
    input.refField.trim().slice(0, 40) || "ref",
    JSON.stringify(input.extra || {}),
    input.enabled,
  ];
  try {
    if (input.id) {
      const updated = await sql.query<{ id: string }>(
        `update shop_airtime_routes
         set provider_id = $2, provider_network_id = $3, purchase_path = $4, auth_header = $5, auth_prefix = $6,
             network_field = $7, phone_field = $8, amount_field = $9, ref_field = $10, extra_json = $11, enabled = $12, updated_at = now()
         where id = $1
         returning id`,
        [input.id, input.providerId, ...values],
      );
      if (!updated[0]) return { error: "That provider route was not found." };
    } else {
      await sql.query(
        `insert into shop_airtime_routes (
           id, network_id, provider_id, provider_network_id, purchase_path, auth_header, auth_prefix,
           network_field, phone_field, amount_field, ref_field, extra_json, enabled
         ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [uid("route"), input.networkId, input.providerId, ...values],
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/unique|duplicate/i.test(message)) return { error: "That provider is already mapped to this network." };
    throw err;
  }
  if (input.enabled) {
    await sql.query(
      "update shop_airtime_routes set enabled = false, updated_at = now() where network_id = $1 and provider_id <> $2 and enabled = true",
      [input.networkId, input.providerId],
    );
  }
  return { error: null as string | null };
}

export async function deleteAirtimeRouteRow(id: string) {
  const sql = await getSql();
  await sql.query("delete from shop_airtime_routes where id = $1", [id]);
  return { error: null as string | null };
}

export async function deleteAirtimeNetworkRow(id: string) {
  const sql = await getSql();
  const rows = await sql.query<{ brand: string }>("select brand from shop_airtime_networks where id = $1", [id]);
  if (!rows[0]) return { error: "That network was not found." };
  if (isBuiltInAirtimeBrand(rows[0].brand)) return { error: "MTN, Airtel, Glo and 9mobile stay in the list. Turn the network off instead." };
  await sql.query("delete from shop_airtime_networks where id = $1", [id]);
  return { error: null as string | null };
}
