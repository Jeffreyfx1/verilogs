import { getSql } from "@/lib/db";
import { loadLight } from "@/lib/shop-core.server";
import { classifyProduct, credentialSource, type MapProduct, type MapStatus } from "@/lib/provider-map";
import { readLogKeyForShopProvider } from "@/lib/logs-import.server";
import { readProviderKey } from "@/lib/shop-core.server";

export type MappingRow = {
  id: string;
  name: string;
  category: string;
  providerId: string;
  providerName: string;
  externalId: string;
  serverId: string;
  status: MapStatus;
  reason: string;
  hasCredentials: boolean;
};

export async function resolvePurchaseCredentials(providerId: string, category: string) {
  const providerKey = providerId ? await readProviderKey(providerId) : "";
  const logKey = providerId && (category === "logs" || category === "vpn") ? await readLogKeyForShopProvider(providerId) : "";
  return credentialSource(category, providerKey, logKey);
}

export async function providerMappingReport(filter: MapStatus | "all" = "all") {
  const doc = await loadLight();
  const sql = await getSql();
  const products = await sql<{
    id: string;
    name: string;
    category: string;
    provider_id: string;
    external_id: string;
    server_id: string;
    import_type: string;
  }>`select id, name, category, provider_id, external_id, server_id, import_type from shop_products`;
  const keys = await sql<{ provider_id: string }>`select provider_id from provider_keys where api_key <> ''`;
  const logs = await sql<{ provider_id: string; api_key: string }>`select provider_id, api_key from shop_log_providers where enabled = true`;
  const keySet = new Set(keys.map((row) => row.provider_id));
  const logKeys = new Map(logs.map((row) => [row.provider_id, !!row.api_key.trim()]));
  const providers = doc.providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    serverId: provider.serverId || "",
    importType: provider.importType || "",
    enabled: provider.enabled !== false,
  }));
  const rows: MappingRow[] = products.map((row) => {
    const product: MapProduct = {
      id: row.id,
      name: row.name,
      category: row.category,
      providerId: row.provider_id,
      externalId: row.external_id,
      serverId: row.server_id,
      importType: row.import_type,
    };
    const verdict = classifyProduct(product, providers, keySet, logKeys);
    const provider = providers.find((item) => item.id === row.provider_id);
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      providerId: row.provider_id,
      providerName: provider?.name || "",
      externalId: row.external_id,
      serverId: row.server_id,
      status: verdict.status,
      reason: verdict.reason,
      hasCredentials: verdict.status === "ok",
    };
  });
  const counts = rows.reduce<Record<string, number>>((sum, row) => {
    sum[row.status] = (sum[row.status] || 0) + 1;
    return sum;
  }, {});
  const shown = filter === "all" ? rows : rows.filter((row) => row.status === filter);
  return { counts, total: rows.length, rows: shown.slice(0, 200) };
}

export async function repairProviderMappings() {
  const doc = await loadLight();
  const sql = await getSql();
  const products = await sql<{
    id: string;
    category: string;
    provider_id: string;
    external_id: string;
    server_id: string;
    import_type: string;
  }>`select id, category, provider_id, external_id, server_id, import_type from shop_products`;
  const logs = await sql<{ provider_id: string; api_key: string }>`select provider_id, api_key from shop_log_providers where enabled = true and provider_id <> ''`;
  const providers = doc.providers.map((provider) => ({
    id: provider.id,
    name: provider.name,
    serverId: provider.serverId || "",
    importType: provider.importType || "",
    enabled: provider.enabled !== false,
  }));
  const keys = await sql<{ provider_id: string }>`select provider_id from provider_keys where api_key <> ''`;
  const keySet = new Set(keys.map((row) => row.provider_id));
  const logKeys = new Map(logs.map((row) => [row.provider_id, !!row.api_key.trim()]));
  let repaired = 0;
  let review = 0;
  let mirrored = 0;
  for (const row of logs) {
    if (row.api_key.trim() && !keySet.has(row.provider_id)) {
      await sql`insert into provider_keys (provider_id, api_key) values (${row.provider_id}, ${row.api_key.trim()}) on conflict (provider_id) do update set api_key = ${row.api_key.trim()}`;
      keySet.add(row.provider_id);
      mirrored += 1;
    }
  }
  for (const row of products) {
    const product: MapProduct = {
      id: row.id,
      name: "",
      category: row.category,
      providerId: row.provider_id,
      externalId: row.external_id,
      serverId: row.server_id,
      importType: row.import_type,
    };
    const verdict = classifyProduct(product, providers, keySet, logKeys);
    if (verdict.repairTo && verdict.repairTo !== row.provider_id) {
      await sql`update shop_products set provider_id = ${verdict.repairTo} where id = ${row.id}`;
      repaired += 1;
    } else if (verdict.status === "needs_review" || verdict.status === "missing_provider") review += 1;
  }
  return { repaired, review, mirrored };
}
