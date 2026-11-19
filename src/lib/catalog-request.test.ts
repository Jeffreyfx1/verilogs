import assert from "node:assert/strict";
import test from "node:test";
import { emptySetup, runCatalogProbe, type CatalogMethod, type CatalogSetup, type CatalogTransport } from "./catalog-request.ts";

const product = { id: "p1", name: "MTN 1GB", price: 300, network: "MTN", validity: "30 days" };
const catalogue = { data: { plans: [product, { id: "p2", name: "Airtel 2GB", price: 500, network: "Airtel", validity: "7 days" }] }, next: null };

function json(status: number, body: unknown) {
  return { status, text: JSON.stringify(body) };
}

function scripted(steps: Array<{ status: number; body?: unknown; text?: string; timedOut?: boolean; network?: boolean }>) {
  const calls: Array<{ method: CatalogMethod; url: string; body?: string; headers: Record<string, string> }> = [];
  let n = 0;
  const transport: CatalogTransport = async (input) => {
    calls.push({ method: input.method, url: input.url, body: input.body, headers: input.headers });
    const step = steps[Math.min(n, steps.length - 1)];
    n += 1;
    if (step.timedOut) return { status: 0, text: "", timedOut: true };
    if (step.network) return { status: 0, text: "", network: true };
    return { status: step.status, text: step.text ?? (step.body === undefined ? "" : JSON.stringify(step.body)) };
  };
  return { transport, calls };
}

function setup(patch: Partial<CatalogSetup> = {}): CatalogSetup {
  return { ...emptySetup(), ...patch };
}

test("a GET catalogue is read once and not posted", async () => {
  const { transport, calls } = scripted([{ status: 200, body: catalogue }]);
  const probe = await runCatalogProbe("https://provider.example/api/catalogue", setup(), "secret", transport);
  assert.equal(probe.ok, true);
  assert.equal(probe.method, "GET");
  assert.equal(probe.discovered, 2);
  assert.equal(probe.pages, true);
  assert.equal(probe.setup.confirmed, true);
  assert.deepEqual(calls.map((call) => call.method), ["GET"]);
  assert.equal(calls[0]?.headers.Authorization, "Bearer secret");
});

test("a POST-only catalogue is used only after GET returns 405", async () => {
  const { transport, calls } = scripted([{ status: 405, body: {} }, { status: 200, body: [product] }]);
  const probe = await runCatalogProbe("https://provider.example/api/catalogue", setup(), "", transport);
  assert.equal(probe.ok, true);
  assert.equal(probe.method, "POST");
  assert.equal(probe.discovered, 1);
  assert.deepEqual(calls.map((call) => call.method), ["GET", "POST"]);
});

test("POST 405 falls back to GET and stops", async () => {
  const { transport, calls } = scripted([{ status: 405 }, { status: 200, body: [product] }]);
  const probe = await runCatalogProbe("https://provider.example/api/catalogue", setup({ method: "POST" }), "", transport);
  assert.equal(probe.ok, true);
  assert.equal(probe.method, "GET");
  assert.deepEqual(calls.map((call) => call.method), ["POST", "GET"]);
});

test("authentication, permission, missing, rate, and server errors do not change method", async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const { transport, calls } = scripted([{ status }]);
    const probe = await runCatalogProbe("https://provider.example/api/catalogue", setup(), "secret", transport);
    assert.equal(probe.ok, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, "GET");
    assert.equal(probe.status, status);
  }
});

test("timeout and invalid JSON do not try another method", async () => {
  const timed = scripted([{ status: 0, timedOut: true }]);
  const timeout = await runCatalogProbe("https://provider.example/api/catalogue", setup(), "", timed.transport);
  assert.equal(timeout.ok, false);
  assert.match(timeout.error, /did not respond/);
  assert.equal(timed.calls.length, 1);
  const broken = scripted([{ status: 200, text: "<html>nope</html>" }]);
  const invalid = await runCatalogProbe("https://provider.example/api/catalogue", setup(), "", broken.transport);
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /JSON/);
  assert.equal(broken.calls.length, 1);
});

test("an empty catalogue is not treated as the wrong method", async () => {
  const { transport, calls } = scripted([{ status: 200, body: [] }]);
  const probe = await runCatalogProbe("https://provider.example/api/catalogue", setup(), "", transport);
  assert.equal(probe.ok, false);
  assert.match(probe.error, /empty/);
  assert.equal(probe.setup.confirmed, true);
  assert.deepEqual(calls.map((call) => call.method), ["GET"]);
});

test("nested products are recognized and a field map fills missing names", async () => {
  const nested = await runCatalogProbe("https://provider.example/api/catalogue", setup(), "", scripted([{ status: 200, body: catalogue }]).transport);
  assert.equal(nested.discovered, 2);
  assert.equal(nested.shape, "object");
  const odd = { items: [{ sku: "x1", title: "Smile 5GB", amount: 900 }] };
  const mapped = await runCatalogProbe(
    "https://provider.example/api/catalogue",
    setup({ fieldMap: { id: "sku", name: "title", price: "amount" } }),
    "",
    scripted([{ status: 200, body: odd }]).transport,
  );
  assert.equal(mapped.ok, true);
  assert.equal(mapped.discovered, 1);
});

test("a purchase address is never called", async () => {
  const { transport, calls } = scripted([{ status: 200, body: [product] }]);
  const probe = await runCatalogProbe("https://provider.example/api/purchase", setup({ method: "POST", auth: "bearer" }), "secret", transport);
  assert.equal(probe.ok, false);
  assert.match(probe.error, /order/);
  assert.equal(calls.length, 0);
});

test("PUT is used only when requested and a 405 falls back to GET, never DELETE", async () => {
  const { transport, calls } = scripted([{ status: 405 }, { status: 200, body: [product] }]);
  const probe = await runCatalogProbe("https://provider.example/api/catalogue", setup({ method: "PUT" }), "", transport);
  assert.equal(probe.method, "GET");
  assert.deepEqual(calls.map((call) => call.method), ["PUT", "GET"]);
});

test("GetaText BAD_KEY is an authentication failure and is not retried", async () => {
  const { transport, calls } = scripted([{ status: 200, text: "BAD_KEY" }]);
  const probe = await runCatalogProbe("https://getatext.com/api/prices", setup(), "bad", transport);
  assert.equal(probe.ok, false);
  assert.match(probe.error, /rejected the API key/);
  assert.deepEqual(calls.map((call) => call.method), ["GET"]);
  assert.equal(calls[0]?.url.includes("bad"), false);
});

test("GetaText catalogue is GET with the Auth header and never a purchase call", async () => {
  const services = [
    { service_name: "Whatsapp", api_name: "whatsapp", multiple_sms: "true", price: "0.55", ttl: 5, stock: 66, cashback: false },
    { service_name: "Telegram", api_name: "telegram", price: "0.45", ttl: 20, stock: 10, cashback: false },
    { service_name: "Missing", price: "1.00", ttl: 5, stock: 1 },
  ];
  const { transport, calls } = scripted([{ status: 200, body: services }]);
  const probe = await runCatalogProbe(
    "https://getatext.com/stubs/handler_api.php?action=getPrices&api_key=secret-key",
    setup({ method: "POST", auth: "bearer", headerName: "Authorization", body: { service: "whatsapp" }, query: { api_key: "secret-key" } }),
    "secret-key",
    transport,
  );
  assert.equal(probe.ok, true);
  assert.equal(probe.method, "GET");
  assert.equal(probe.discovered, 2);
  assert.equal(probe.setup.auth, "custom");
  assert.equal(probe.setup.headerName, "Auth");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "GET");
  assert.equal(calls[0]?.headers.Auth, "secret-key");
  assert.equal(calls[0]?.headers.Authorization, undefined);
  assert.equal(calls[0]?.body, undefined);
  assert.equal(new URL(calls[0]?.url || "").pathname, "/api/v1/prices-info");
  assert.equal(calls[0]?.url.includes("secret-key"), false);
  assert.equal(calls[0]?.url.includes("api_key"), false);
  const refused = scripted([{ status: 200, body: services }]);
  const blocked = await runCatalogProbe("https://getatext.com/api/v1/rent-a-number", setup({ method: "POST", auth: "bearer" }), "secret-key", refused.transport);
  assert.equal(blocked.ok, false);
  assert.equal(refused.calls.length, 0);
  const denied = scripted([{ status: 405 }]);
  const noPost = await runCatalogProbe("https://getatext.com/api/v1/prices-info", setup(), "secret-key", denied.transport);
  assert.equal(noPost.ok, false);
  assert.deepEqual(denied.calls.map((call) => call.method), ["GET"]);
});

test("a custom header name is sent as itself and not as Authorization", async () => {
  const { transport, calls } = scripted([{ status: 200, body: [product] }]);
  const probe = await runCatalogProbe(
    "https://provider.example/api/catalogue",
    setup({ method: "GET", auth: "custom", headerName: "X_Merchant_Key" }),
    "secret-key",
    transport,
  );
  assert.equal(probe.ok, true);
  assert.equal(calls[0]?.headers.X_Merchant_Key, "secret-key");
  assert.equal(calls[0]?.headers.Authorization, undefined);
  assert.equal(calls[0]?.headers.Auth, undefined);
  assert.equal(calls[0]?.body, undefined);
  assert.equal(calls[0]?.url.includes("secret-key"), false);
});
test("saved SMEAPI hint uses GET and an Authorization token", async () => {
  const { transport, calls } = scripted([{ status: 200, body: [product] }]);
  const probe = await runCatalogProbe("https://smeapi.com.ng/api/dataplans/", setup(), "tok", transport);
  assert.equal(probe.method, "GET");
  assert.equal(calls[0]?.headers.Authorization, "Token tok");
  assert.equal(probe.setup.confirmed, true);
});
