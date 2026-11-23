/** Decides whether an imported product is tied to the provider that should sell it. Never guesses across servers. */

export type MapProvider = {
  id: string;
  name: string;
  serverId: string;
  importType: string;
  enabled: boolean;
};

export type MapProduct = {
  id: string;
  name: string;
  category: string;
  providerId: string;
  externalId: string;
  serverId: string;
  importType: string;
};

export type MapStatus = "ok" | "missing_provider" | "missing_credentials" | "missing_service_id" | "needs_review";

export type MapVerdict = {
  status: MapStatus;
  repairTo: string;
  reason: string;
};

const NUMBER_SLOTS = new Set(["1", "2", "3"]);

export function classifyProduct(
  product: MapProduct,
  providers: MapProvider[],
  keys: Set<string>,
  logKeys: Map<string, boolean>,
): MapVerdict {
  const provider = providers.find((item) => item.id === product.providerId);
  if (!product.externalId) {
    return { status: "missing_service_id", repairTo: "", reason: "The product has no provider service id." };
  }
  if (!provider) {
    const slot = product.serverId;
    if (NUMBER_SLOTS.has(slot)) {
      const holders = providers.filter((item) => item.serverId === slot && item.importType === "NUMBER_IMPORT");
      if (holders.length === 1) {
        return { status: "missing_provider", repairTo: holders[0].id, reason: `The product belongs to Server ${slot} and that server has one provider.` };
      }
    }
    if ((product.category === "logs" || product.category === "vpn") && product.providerId) {
      return { status: "needs_review", repairTo: "", reason: "The product points at a provider that is not in the shop." };
    }
    return { status: "needs_review", repairTo: "", reason: "The product is not linked to a known provider." };
  }
  const hasKey = keys.has(provider.id) || (product.category === "logs" || product.category === "vpn" ? !!logKeys.get(provider.id) : false);
  if (!hasKey) {
    return { status: "missing_credentials", repairTo: "", reason: "The provider has no saved credentials." };
  }
  return { status: "ok", repairTo: "", reason: "" };
}

export function credentialSource(category: string, providerKey: string, logKey: string): { apiKey: string; source: "provider_keys" | "log_provider" | "" } {
  if (providerKey) return { apiKey: providerKey, source: "provider_keys" };
  if ((category === "logs" || category === "vpn") && logKey) return { apiKey: logKey, source: "log_provider" };
  return { apiKey: "", source: "" };
}
