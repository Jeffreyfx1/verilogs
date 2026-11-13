import { createServerFn } from "@tanstack/react-start";
import type { Data, SyncReport } from "@/lib/catalog";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
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

export const fetchCatalogue = createServerFn({ method: "POST" })
  .validator((input: { url: string; apiKey?: string; providerId?: string }) => ({
    url: String(input?.url || ""),
    apiKey: input?.apiKey ? String(input.apiKey) : "",
    providerId: input?.providerId ? String(input.providerId) : "",
  }))
  .handler(async ({ data }): Promise<{ ok: true; payload: Json } | { ok: false; error: string }> => {
    const { pullRemote } = await core();
    const res = await pullRemote(data);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, payload: res.payload as Json };
  });

export const supportAsk = createServerFn({ method: "POST" })
  .validator((input: { question: string }) => ({ question: String(input?.question || "").slice(0, 500) }))
  .handler(async ({ data }) => {
    const { askSupport } = await core();
    return askSupport(data.question);
  });
