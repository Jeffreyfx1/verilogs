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
  fetchNote?: string;
};

type ShopPayload = { error: string | null; state: Data; report: SyncReport | null; orderId?: string };

type SetupDraft = {
  method?: string;
  auth?: string;
  headerName?: string;
  contentType?: string;
  query?: string;
  headers?: string;
  body?: string;
  fieldMap?: string;
};

function setupDraft(input: SetupDraft | null | undefined): SetupDraft {
  const cut = (value: unknown, max: number) => String(value || "").slice(0, max);
  return {
    method: cut(input?.method, 10),
    auth: cut(input?.auth, 20),
    headerName: cut(input?.headerName, 40),
    contentType: cut(input?.contentType, 10),
    query: cut(input?.query, 2000),
    headers: cut(input?.headers, 2000),
    body: cut(input?.body, 2000),
    fieldMap: cut(input?.fieldMap, 2000),
  };
}

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

export const purchaseResult = createServerFn({ method: "POST" })
  .validator((input: { orderId?: string; refresh?: boolean }) => ({ orderId: String(input?.orderId || "").slice(0, 80), refresh: input?.refresh !== false }))
  .handler(async ({ data }) => {
    const { openPurchase } = await core();
    return openPurchase(data.orderId, data.refresh);
  });

export const webhookDesk = createServerFn({ method: "GET" }).handler(async () => {
  const { adminContext } = await core();
  const admin = await adminContext();
  if (!admin) return { error: "Only an admin can do that.", rows: [], log: [] };
  const { webhookHealth, webhookLog } = await import("@/lib/fulfilment.server");
  return { error: null as string | null, rows: await webhookHealth(), log: await webhookLog() };
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
  .validator((input: { url?: string; payload?: unknown; apiKey?: string; providerId?: string; name?: string; baseUrl?: string; currency?: string; usdRate?: number; markup?: number; publish?: boolean; kind?: string; selective?: boolean; setup?: SetupDraft }) => ({
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
    setup: setupDraft(input?.setup),
  }))
  .handler(async ({ data }): Promise<ImportStep> => {
    const { parseSetupDraft } = await import("@/lib/catalog-request");
    const parsed = parseSetupDraft(data.setup);
    if (!parsed.ok) return { error: parsed.error, jobId: "", total: 0, saved: 0, batch: 0, batches: 0, batchSize: 0, done: false, report: null, state: null };
    const { beginCatalogImport } = await core();
    return beginCatalogImport({ ...data, setup: parsed.setup });
  });

export const browseRemoteCatalog = createServerFn({ method: "POST" })
  .validator((input: { url?: string; apiKey?: string; providerId?: string; cursor?: string; q?: string; setup?: SetupDraft }) => ({
    url: String(input?.url || "").slice(0, 2000),
    apiKey: input?.apiKey ? String(input.apiKey).slice(0, 500) : "",
    providerId: input?.providerId ? String(input.providerId).slice(0, 80) : "",
    cursor: input?.cursor ? String(input.cursor).slice(0, 2000) : "",
    q: String(input?.q || "").slice(0, 80),
    setup: setupDraft(input?.setup),
  }))
  .handler(async ({ data }) => {
    const { parseSetupDraft } = await import("@/lib/catalog-request");
    const parsed = parseSetupDraft(data.setup);
    if (!parsed.ok) return { error: parsed.error, items: [], total: null, page: null, lastPage: null, nextCursor: "" };
    const { browseRemoteCatalog } = await core();
    return browseRemoteCatalog({ ...data, setup: parsed.setup });
  });

export const openCatalogSetup = createServerFn({ method: "POST" })
  .validator((input: { providerId?: string }) => ({ providerId: String(input?.providerId || "").slice(0, 80) }))
  .handler(async ({ data }) => {
    const { openCatalogSetup } = await core();
    return openCatalogSetup(data.providerId);
  });

export const testCatalogConnection = createServerFn({ method: "POST" })
  .validator((input: { url?: string; apiKey?: string; providerId?: string; setup?: SetupDraft }) => ({
    url: String(input?.url || "").slice(0, 2000),
    apiKey: input?.apiKey ? String(input.apiKey).slice(0, 500) : "",
    providerId: input?.providerId ? String(input.providerId).slice(0, 80) : "",
    setup: setupDraft(input?.setup),
  }))
  .handler(async ({ data }) => {
    const { parseSetupDraft } = await import("@/lib/catalog-request");
    const parsed = parseSetupDraft(data.setup);
    if (!parsed.ok) return { error: parsed.error, report: null };
    const { testCatalogConnection } = await core();
    return testCatalogConnection({ ...data, setup: parsed.setup });
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
  .validator((input: { category?: string; q?: string; network?: string }) => ({
    category: String(input?.category || ""),
    q: String(input?.q || "").slice(0, 60),
    network: String(input?.network || "").slice(0, 40),
  }))
  .handler(async ({ data }) => {
    const { listShelf } = await core();
    return listShelf(data.category, data.q, data.network);
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
  .validator((input: { question: string; threadId?: string }) => ({
    question: String(input?.question || "").slice(0, 500),
    threadId: String(input?.threadId || "").slice(0, 80),
  }))
  .handler(async ({ data }) => {
    const { askSupport } = await core();
    return askSupport(data.question, data.threadId);
  });

export const supportFeedback = createServerFn({ method: "POST" })
  .validator((input: { threadId?: string; helpful?: string; comment?: string }) => ({
    threadId: String(input?.threadId || "").slice(0, 80),
    helpful: input?.helpful === "yes" ? "yes" as const : "no" as const,
    comment: String(input?.comment || "").slice(0, 400),
  }))
  .handler(async ({ data }) => {
    const { sessionCustomer } = await core();
    const { recordVeraFeedback } = await import("@/lib/vera.server");
    const me = await sessionCustomer();
    return recordVeraFeedback({ threadId: data.threadId, userId: me?.id || "", helpful: data.helpful, comment: data.comment });
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

export const refreshLogos = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({ id: String(input?.id || "") }))
  .handler(async ({ data }) => {
    await adminOnly();
    const { refreshLogLogos } = await import("@/lib/logs-import.server");
    return refreshLogLogos(data.id);
  });

export const saveProductLogo = createServerFn({ method: "POST" })
  .validator((input: { id?: string; imageUrl?: string }) => ({ id: String(input?.id || ""), imageUrl: String(input?.imageUrl || "").slice(0, 400) }))
  .handler(async ({ data }) => {
    await adminOnly();
    const { setProductImage } = await import("@/lib/product-rows.server");
    const saved = await setProductImage(data.id, data.imageUrl);
    return saved ? { error: null as string | null } : { error: "Enter a product and an https logo URL from the provider." };
  });

export const logoManager = createServerFn({ method: "GET" }).handler(async () => {
  await adminOnly();
  const { logoDesk } = await import("@/lib/logo-discover.server");
  return logoDesk();
});

export const scanCategoryLogos = createServerFn({ method: "POST" }).handler(async () => {
  await adminOnly();
  const { scanAccsZone } = await import("@/lib/logo-discover.server");
  return scanAccsZone();
});

export const importCategoryLogos = createServerFn({ method: "POST" })
  .validator((input: { categories?: string[]; allHigh?: boolean; replace?: boolean }) => ({
    categories: Array.isArray(input?.categories) ? input.categories.map((name) => String(name || "").slice(0, 80)).slice(0, 500) : [],
    allHigh: !!input?.allHigh,
    replace: !!input?.replace,
  }))
  .handler(async ({ data }) => {
    await adminOnly();
    const { importCategoryLogos: run } = await import("@/lib/logo-discover.server");
    return run(data);
  });

export const saveManualCategoryLogo = createServerFn({ method: "POST" })
  .validator((input: { category?: string; imageUrl?: string; replace?: boolean }) => ({
    category: String(input?.category || "").slice(0, 80),
    imageUrl: String(input?.imageUrl || "").slice(0, 500),
    replace: !!input?.replace,
  }))
  .handler(async ({ data }) => {
    await adminOnly();
    const { saveManualLogo } = await import("@/lib/logo-discover.server");
    return saveManualLogo(data);
  });

export const refreshCategoryLogos = createServerFn({ method: "POST" }).handler(async () => {
  await adminOnly();
  const { refreshCategoryLogos: run } = await import("@/lib/logo-discover.server");
  return run();
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

export const listAirtimeOffers = createServerFn({ method: "GET" }).handler(async () => {
  const { listPublicAirtime } = await core();
  return listPublicAirtime();
});

export const listAirtimeAdmin = createServerFn({ method: "GET" }).handler(async () => {
  const { listAdminAirtime } = await core();
  return listAdminAirtime();
});

export const saveAirtimeNetwork = createServerFn({ method: "POST" })
  .validator((input: { id?: string; name?: string; imageUrl?: string; enabled?: boolean; minAmount?: number; maxAmount?: number; profitNaira?: number | null }) => ({
    id: String(input?.id || "").slice(0, 40),
    name: String(input?.name || "").slice(0, 40),
    imageUrl: String(input?.imageUrl || "").slice(0, 400),
    enabled: !!input?.enabled,
    minAmount: Math.round(Number(input?.minAmount) || 0),
    maxAmount: Math.round(Number(input?.maxAmount) || 0),
    profitNaira: input?.profitNaira == null || Number.isNaN(Number(input.profitNaira)) ? null : Math.round(Number(input.profitNaira)),
  }))
  .handler(async ({ data }) => {
    const { saveAdminAirtimeNetwork } = await core();
    return saveAdminAirtimeNetwork(data);
  });

export const saveAirtimeRoute = createServerFn({ method: "POST" })
  .validator((input: Record<string, unknown>) => {
    let extra: Record<string, string> = {};
    try {
      const parsed = JSON.parse(String(input?.extraJson || "{}")) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        extra = Object.fromEntries(Object.entries(parsed).slice(0, 8).map(([key, value]) => [String(key).slice(0, 40), String(value ?? "").slice(0, 40)]));
      }
    } catch {
      extra = {};
    }
    return {
      id: String(input?.id || "").slice(0, 40),
      networkId: String(input?.networkId || "").slice(0, 40),
      providerId: String(input?.providerId || "").slice(0, 80),
      providerNetworkId: String(input?.providerNetworkId || "").slice(0, 40),
      purchasePath: String(input?.purchasePath || "").slice(0, 200),
      authHeader: String(input?.authHeader || "Authorization").slice(0, 40),
      authPrefix: String(input?.authPrefix || "").slice(0, 20),
      networkField: String(input?.networkField || "network").slice(0, 40),
      phoneField: String(input?.phoneField || "phone").slice(0, 40),
      amountField: String(input?.amountField || "amount").slice(0, 40),
      refField: String(input?.refField || "ref").slice(0, 40),
      extra,
      enabled: !!input?.enabled,
    };
  })
  .handler(async ({ data }) => {
    const { saveAdminAirtimeRoute } = await core();
    return saveAdminAirtimeRoute(data);
  });

export const deleteAirtimeRoute = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({ id: String(input?.id || "").slice(0, 40) }))
  .handler(async ({ data }) => {
    const { removeAdminAirtimeRoute } = await core();
    return removeAdminAirtimeRoute(data.id);
  });

export const deleteAirtimeNetwork = createServerFn({ method: "POST" })
  .validator((input: { id?: string }) => ({ id: String(input?.id || "").slice(0, 40) }))
  .handler(async ({ data }) => {
    const { removeAdminAirtimeNetwork } = await core();
    return removeAdminAirtimeNetwork(data.id);
  });

