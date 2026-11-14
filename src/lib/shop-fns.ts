import { createServerFn } from "@tanstack/react-start";
import type { Data, SyncReport } from "@/lib/catalog";

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
  .validator((input: { amount: number }) => ({ amount: Number(input?.amount) }))
  .handler(async ({ data }) => {
    const { startPaystack } = await core();
    return startPaystack(data.amount);
  });

export const confirmPaystack = createServerFn({ method: "POST" })
  .validator((input: { reference: string }) => ({ reference: String(input?.reference || "") }))
  .handler(async ({ data }) => {
    if (!data.reference) return { error: "Missing payment reference." as string };
    const { creditPaystack } = await core();
    return creditPaystack(data.reference, "session");
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
  .validator((input: { providerId?: string; category?: string; country?: string; service?: string; q?: string }) => ({
    providerId: String(input?.providerId || ""),
    category: input?.category === "rent" ? "rent" : "numbers",
    country: String(input?.country || ""),
    service: String(input?.service || ""),
    q: String(input?.q || "").slice(0, 60),
  }))
  .handler(async ({ data }) => {
    const { browseNumbers } = await core();
    return browseNumbers(data);
  });

export const browseCatalog = createServerFn({ method: "POST" })
  .validator((input: { q?: string; category?: string; providerId?: string; only?: string; page?: number }) => ({
    q: String(input?.q || "").slice(0, 60),
    category: String(input?.category || ""),
    providerId: String(input?.providerId || ""),
    only: input?.only === "on" || input?.only === "off" ? input.only : "all",
    page: Number(input?.page) || 0,
  }))
  .handler(async ({ data }) => {
    const { browseCatalog } = await core();
    return browseCatalog(data);
  });

export const supportAsk = createServerFn({ method: "POST" })
  .validator((input: { question: string }) => ({ question: String(input?.question || "").slice(0, 500) }))
  .handler(async ({ data }) => {
    const { askSupport } = await core();
    return askSupport(data.question);
  });
