import { createServerFn } from "@tanstack/react-start";
import type { Data, SyncReport } from "@/lib/catalog";

export type ImportStep = {
  error: string | null;
  jobId: string;
  total: number;
  saved: number;
  batch: number;
  batches: number;
  batchSize: number;
  done: boolean;
  report: SyncReport | null;
  state: Data | null;
};

type ShopPayload = { error: string | null; state: Data; report: SyncReport | null };

async function core() {
  return import("./shop-core.server");
}

export const pullShop = createServerFn({ method: "GET" }).handler(async (): Promise<ShopPayload> => {
  const { currentShop } = await core();
  return currentShop();
});

export const shopAct = createServerFn({ method: "POST" })
  .validator((input: { op: string; payload?: Record<string, unknown> }) => {
    if (!input || typeof input.op !== "string" || input.op.length > 40) throw new Error("Bad request");
    return { op: input.op, payload: input.payload && typeof input.payload === "object" ? input.payload : {} };
  })
  .handler(async ({ data }): Promise<ShopPayload> => {
    const { applyAct } = await core();
    return applyAct(data.op, data.payload);
  });

export const hostStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { integrationStatus } = await core();
  return integrationStatus();
});

export const beginPaystack = createServerFn({ method: "POST" })
  .validator((input: { amount: number; productId?: string }) => ({ amount: Number(input?.amount), productId: String(input?.productId || "") }))
  .handler(async ({ data }) => {
    const { startPaystack } = await core();
    return startPaystack(data.amount, data.productId);
  });

export const purchasePreview = createServerFn({ method: "POST" })
  .validator((input: { productId: string }) => ({ productId: String(input?.productId || "") }))
  .handler(async ({ data }) => {
    const { purchasePreview } = await core();
    return purchasePreview(data.productId);
  });

export const confirmPaystack = createServerFn({ method: "POST" })
  .validator((input: { reference: string }) => ({ reference: String(input?.reference || "") }))
  .handler(async ({ data }) => {
    if (!data.reference) return { error: "Missing payment reference." as string };
    const { creditPaystack } = await core();
    return creditPaystack(data.reference, "session");
  });

export const clearNumberCatalog = createServerFn({ method: "POST" }).handler(async () => {
  const { clearNumberCatalog } = await core();
  return clearNumberCatalog();
});

export const beginCatalogImport = createServerFn({ method: "POST" })
  .validator((input: { url?: string; payload?: unknown; apiKey?: string; providerId?: string; name?: string; baseUrl?: string; currency?: string; usdRate?: number; markup?: number; publish?: boolean; kind?: string; selective?: boolean }) => ({
    url: String(input?.url || ""),
    payload: input?.payload,
    apiKey: input?.apiKey ? String(input.apiKey) : "",
    providerId: input?.providerId ? String(input.providerId) : "",
    name: input?.name ? String(input.name) : "",
    baseUrl: input?.baseUrl ? String(input.baseUrl) : "",
    currency: input?.currency === "USD" ? "USD" : "NGN",
    usdRate: Number(input?.usdRate) || 0,
    markup: Number(input?.markup) || 0,
    publish: !!input?.publish,
    kind: ["vtu", "vtu-airtime", "vtu-data", "vpn", "smm", "random", "numbers", "server2", "server3", "usa"].includes(String(input?.kind)) ? String(input?.kind) : "numbers",
    selective: !!input?.selective,
  }))
  .handler(async ({ data }): Promise<ImportStep> => {
    const { beginCatalogImport } = await core();
    return beginCatalogImport(data);
  });

export const browseRemoteCatalog = createServerFn({ method: "POST" })
  .validator((input: { url?: string; apiKey?: string; providerId?: string; cursor?: string; q?: string }) => ({
    url: String(input?.url || "").slice(0, 2000),
    apiKey: input?.apiKey ? String(input.apiKey).slice(0, 500) : "",
    providerId: input?.providerId ? String(input.providerId).slice(0, 80) : "",
    cursor: input?.cursor ? String(input.cursor).slice(0, 2000) : "",
    q: String(input?.q || "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    const { browseRemoteCatalog } = await core();
    return browseRemoteCatalog(data);
  });

export const stepCatalogImport = createServerFn({ method: "POST" })
  .validator((input: { jobId: string }) => ({ jobId: String(input?.jobId || "") }))
  .handler(async ({ data }): Promise<ImportStep> => {
    const { stepCatalogImport } = await core();
    return stepCatalogImport(data.jobId);
  });

export const importUrl = createServerFn({ method: "POST" })
  .validator((input: { url: string; apiKey?: string; providerId?: string; name?: string; baseUrl?: string; currency?: string; usdRate?: number; markup?: number; publish?: boolean }) => ({
    url: String(input?.url || ""),
    apiKey: input?.apiKey ? String(input.apiKey) : "",
    providerId: input?.providerId ? String(input.providerId) : "",
    name: input?.name ? String(input.name) : "",
    baseUrl: input?.baseUrl ? String(input.baseUrl) : "",
    currency: input?.currency === "USD" ? "USD" : "NGN",
    usdRate: Number(input?.usdRate) || 0,
    markup: Number(input?.markup) || 0,
    publish: !!input?.publish,
  }))
  .handler(async ({ data }) => {
    const { importFromUrl } = await core();
    return importFromUrl(data);
  });

export const browseNumbers = createServerFn({ method: "POST" })
  .validator((input: { providerId?: string; category?: string; country?: string; service?: string; q?: string; detail?: boolean; list?: string; serverId?: string }) => ({
    providerId: String(input?.providerId || ""),
    category: input?.category === "rent" ? "rent" : input?.category === "usa" ? "usa" : input?.category === "number" ? "number" : "numbers",
    serverId: String(input?.serverId || ""),
    country: String(input?.country || ""),
    service: String(input?.service || ""),
    q: String(input?.q || "").slice(0, 60),
    detail: !!input?.detail,
    list: input?.list === "countries" || input?.list === "services" ? input.list : "",
  }))
  .handler(async ({ data }) => {
    const { browseNumbers } = await core();
    return browseNumbers(data);
  });

export const browseExtras = createServerFn({ method: "POST" })
  .validator((input: { q?: string; kind?: string; page?: number; subcategory?: string; after?: string }) => ({
    q: String(input?.q || "").slice(0, 60),
    kind: (input?.kind === "vpn" || input?.kind === "smm" ? input.kind : "random") as "vpn" | "smm" | "random",
    page: Math.max(0, Math.min(5000, Math.floor(Number(input?.page) || 0))),
    subcategory: String(input?.subcategory || "").slice(0, 40),
    after: String(input?.after || "").slice(0, 200),
  }))
  .handler(async ({ data }) => {
    const { browseExtras } = await core();
    return browseExtras(data);
  });

export const testInstaking = createServerFn({ method: "POST" })
  .validator((input: { apiKey?: string }) => ({ apiKey: String(input?.apiKey || "") }))
  .handler(async ({ data }) => {
    const { testInstakingKey } = await core();
    return testInstakingKey(data.apiKey);
  });

export const browseCatalog = createServerFn({ method: "POST" })
  .validator((input: { q?: string; category?: string; providerId?: string; only?: string; page?: number; subcategory?: string; after?: string }) => ({
    q: String(input?.q || "").slice(0, 60),
    category: String(input?.category || ""),
    providerId: String(input?.providerId || ""),
    only: input?.only === "on" || input?.only === "off" ? input.only : "all",
    page: Number(input?.page) || 0,
    subcategory: String(input?.subcategory || "").slice(0, 40),
    after: String(input?.after || "").slice(0, 200),
  }))
  .handler(async ({ data }) => {
    const { browseCatalog } = await core();
    return browseCatalog(data);
  });

export const listShelf = createServerFn({ method: "POST" })
  .validator((input: { category?: string; q?: string }) => ({
    category: String(input?.category || ""),
    q: String(input?.q || "").slice(0, 60),
  }))
  .handler(async ({ data }) => {
    const { listShelf } = await core();
    return listShelf(data.category, data.q);
  });

export const catalogStats = createServerFn({ method: "GET" }).handler(async () => {
  const { adminCatalogStats } = await core();
  return adminCatalogStats();
});

export const pricingSample = createServerFn({ method: "GET" }).handler(async () => {
  const { pricingSample } = await core();
  return pricingSample();
});

export const openImportJobs = createServerFn({ method: "GET" }).handler(async () => {
  const { openImportJobs } = await core();
  return openImportJobs();
});

export const supportAsk = createServerFn({ method: "POST" })
  .validator((input: { question: string }) => ({ question: String(input?.question || "").slice(0, 500) }))
  .handler(async ({ data }) => {
    const { askSupport } = await core();
    return askSupport(data.question);
  });

async function adminOnly() {
  const { adminContext } = await core();
  const admin = await adminContext();
  if (!admin) throw new Error("Only an admin can do that.");
  return admin;
}

export const profitReport = createServerFn({ method: "GET" }).handler(async () => {
  const { businessProfit } = await core();
  return businessProfit();
});

export const logProviders = createServerFn({ method: "GET" }).handler(async () => {
  await adminOnly();
  const { listLogProviders } = await import("@/lib/logs-import.server");
  return listLogProviders();
});

export const saveLogProvider = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => input)
  .handler(async ({ data }) => {
    await adminOnly();
    const { saveLogProvider: save } = await import("@/lib/logs-import.server");
    return save({
      id: String(data.id || ""),
      name: String(data.name || ""),
      baseUrl: String(data.baseUrl || ""),
      apiKey: String(data.apiKey || ""),
      productsPath: String(data.productsPath || "/listings"),
      method: String(data.method || "GET"),
      authMethod: String(data.authMethod || "header"),
      apiKeyHeader: String(data.apiKeyHeader || "X-API-Key"),
      extraHeaders: String(data.extraHeaders || "{}"),
      queryJson: String(data.queryJson || "{}"),
      bodyJson: String(data.bodyJson || "{}"),
      paginationJson: String(data.paginationJson || "{}"),
      fieldMap: String(data.fieldMap || "{}"),
      enabled: data.enabled !== false,
      currency: String(data.currency || "USD"),
      usdRate: Number(data.usdRate) || 0,
    });
  });

export const removeLogProvider = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({ id: String(input?.id || "") }))
  .handler(async ({ data }) => {
    await adminOnly();
    const { deleteLogProvider } = await import("@/lib/logs-import.server");
    return deleteLogProvider(data.id);
  });

export const testLogProvider = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({ id: String(input?.id || "") }))
  .handler(async ({ data }) => {
    await adminOnly();
    const { testLogProvider: test } = await import("@/lib/logs-import.server");
    return test(data.id);
  });

export const previewLogProvider = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({ id: String(input?.id || "") }))
  .handler(async ({ data }) => {
    await adminOnly();
    const { previewLogProvider: preview } = await import("@/lib/logs-import.server");
    return preview(data.id);
  });

export const runLogImport = createServerFn({ method: "POST" })
  .validator((input: { id?: string; resume?: boolean }) => ({ id: String(input?.id || ""), resume: !!input?.resume }))
  .handler(async ({ data }) => {
    await adminOnly();
    const { importLogProvider } = await import("@/lib/logs-import.server");
    return importLogProvider(data.id, data.resume);
  });

export const myReferrals = createServerFn({ method: "GET" }).handler(async () => {
  const { sessionCustomer } = await core();
  const me = await sessionCustomer();
  if (!me) return { error: "Sign in first." };
  const { referralSummary } = await import("@/lib/referral.server");
  return { error: null, summary: await referralSummary(me.id, me.referralCode || "") };
});

export const moveReferral = createServerFn({ method: "POST" })
  .validator((input: { amount?: number }) => ({ amount: Number(input?.amount) || 0 }))
  .handler(async ({ data }) => {
    const { sessionCustomer } = await core();
    const me = await sessionCustomer();
    if (!me) return { error: "Sign in first.", balance: 0 };
    const { transferReferral } = await import("@/lib/referral.server");
    return transferReferral(me.id, data.amount);
  });

export const referralDesk = createServerFn({ method: "GET" }).handler(async () => {
  await adminOnly();
  const { referralAdmin } = await import("@/lib/referral.server");
  return referralAdmin();
});

