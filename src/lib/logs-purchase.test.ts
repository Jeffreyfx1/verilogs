import assert from "node:assert/strict";
import test from "node:test";
import type { Product, Provider } from "./catalog.ts";
import { placeOnProvider } from "./fulfill.server.ts";

const product = {
  id: "prd",
  providerId: "prov_logs",
  externalId: "8841",
  category: "logs",
  name: "TikTok account",
  service: "TikTok",
  country: "",
  network: "TikTok",
  price: 1980,
  cost: 1.2,
  stock: 222,
  operator: "",
  rate: 0,
  rates: "",
  enabled: true,
  validity: "",
  variable: false,
  description: "",
} satisfies Product;

const provider = {
  id: "prov_logs",
  name: "AccsZone",
  baseUrl: "https://accszone.com",
  hasKey: true,
  servesNumbers: false,
  enabled: true,
  currency: "USD",
  usdRate: 1600,
  markup: 1,
  operatorMarkups: {},
  operatorPrices: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSync: null,
} satisfies Provider;

test("a logs purchase is not sent when no key is saved", async () => {
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const placed = await placeOnProvider({ product, provider, apiKey: "", phone: "", amount: 1 });
    assert.equal(placed.ok, false);
    if (!placed.ok) assert.match(placed.error, /no key saved/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test("logs and vpn on AccsZone use the saved key and one purchase call", async () => {
  const calls: { url: string; key: string; body: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      key: String(new Headers(init?.headers).get("X-API-Key") || ""),
      body: String(init?.body || ""),
    });
    return new Response(JSON.stringify({ data: { accounts: ["user:pass"], order_id: "az-1" } }), { status: 200 });
  }) as typeof fetch;
  try {
    const logs = await placeOnProvider({ product, provider, apiKey: "secret-key", phone: "", amount: 1, clientReference: "once" });
    const vpn = await placeOnProvider({ product: { ...product, category: "vpn" }, provider, apiKey: "secret-key", phone: "", amount: 1, clientReference: "once" });
    assert.equal(logs.ok, true);
    assert.equal(vpn.ok, true);
    if (logs.ok) assert.equal(logs.delivery, "user:pass");
    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "https://accszone.com/api/v1/purchase");
    assert.equal(calls[0].key, "secret-key");
    assert.match(calls[0].body, /"ad_id":8841/);
    assert.match(calls[1].body, /"quantity":1/);
  } finally {
    globalThis.fetch = original;
  }
});
