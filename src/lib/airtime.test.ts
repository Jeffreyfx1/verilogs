import assert from "node:assert/strict";
import test from "node:test";
import {
  airtimeCharge,
  airtimeImportBlock,
  airtimeOffers,
  airtimePurchaseBody,
  prepareAirtimePurchase,
  sendAirtimePurchase,
  suggestedAirtimeRoute,
  withoutAirtimeProducts,
  type AirtimeNetworkRecord,
  type AirtimeRouteRecord,
} from "./airtime.ts";
import { vtuCatalogueUrl } from "./categorize.ts";

const smeRoute: AirtimeRouteRecord = {
  id: "route-mtn",
  networkId: "air-mtn",
  providerId: "prov-sme",
  providerNetworkId: "1",
  purchasePath: "/api/airtime/",
  authHeader: "Authorization",
  authPrefix: "Token",
  networkField: "network",
  phoneField: "phone",
  amountField: "amount",
  refField: "ref",
  extra: { ported_number: "false" },
  enabled: true,
};

const mtn: AirtimeNetworkRecord = {
  id: "air-mtn",
  brand: "mtn",
  name: "MTN",
  imageUrl: "",
  enabled: true,
  minAmount: 50,
  maxAmount: 50000,
  profitNaira: null,
};

test("only a configured airtime network is shown, with its own provider id", () => {
  const providers = [{ id: "prov-sme", enabled: true, baseUrl: "https://smeapi.com.ng" }];
  const shown = airtimeOffers([mtn, { ...mtn, id: "air-glo", brand: "glo", name: "Glo" }], [smeRoute], providers, 300);
  assert.deepEqual(shown.map((item) => item.name), ["MTN"]);
  assert.equal(shown[0]?.profit, 300);
  const body = airtimePurchaseBody(smeRoute, { phone: "08030000000", amount: 500, ref: "VL1" });
  assert.equal(body?.network, 1);
  assert.equal(body?.phone, "08030000000");
  assert.equal(body?.amount, 500);
  assert.equal(body?.ported_number, "false");
  const other = airtimePurchaseBody({ ...smeRoute, providerNetworkId: "mtn-data", networkField: "operator" }, { phone: "08030000000", amount: 200, ref: "VL2" });
  assert.equal(other?.operator, "mtn-data");
  assert.equal("network" in (other || {}), false);
});

test("airtime charge is the amount plus the configured profit", () => {
  const quote = airtimeCharge(500, 300);
  assert.equal(quote.ok && quote.charge, 800);
  assert.equal(quote.ok && quote.profit, 300);
  const custom = airtimeOffers([{ ...mtn, profitNaira: 50 }], [smeRoute], [{ id: "prov-sme", enabled: true, baseUrl: "https://smeapi.com.ng" }], 300);
  assert.equal(custom[0]?.profit, 50);
});

test("a missing provider id never builds a purchase", () => {
  const prepared = prepareAirtimePurchase({
    baseUrl: "https://smeapi.com.ng",
    apiKey: "secret-key",
    route: { ...smeRoute, providerNetworkId: "" },
    phone: "08030000000",
    amount: 100,
    ref: "VL1",
  });
  assert.equal(prepared.ok, false);
  const calls: string[] = [];
  const suggested = suggestedAirtimeRoute("https://smeapi.com.ng/api/dataplans/");
  assert.equal(suggested?.providerNetworkId, "");
  assert.equal(suggested?.purchasePath, "/api/airtime/");
  assert.equal(calls.length, 0);
});

test("an airtime purchase posts the configured id and does not leak the key", async () => {
  const prepared = prepareAirtimePurchase({
    baseUrl: "https://smeapi.com.ng",
    apiKey: "secret-key",
    route: smeRoute,
    phone: "08030000000",
    amount: 500,
    ref: "VLREF",
  });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.equal(prepared.url, "https://smeapi.com.ng/api/airtime/");
  assert.equal(prepared.url.includes("secret-key"), false);
  assert.equal(prepared.headers.Authorization, "Token secret-key");
  assert.equal(prepared.body.network, 1);
  let calls = 0;
  const sent = await sendAirtimePurchase(prepared, "secret-key", async (url, init) => {
    calls += 1;
    assert.equal(url, "https://smeapi.com.ng/api/airtime/");
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Token secret-key");
    assert.equal(String(init?.body).includes("secret-key"), false);
    return new Response(JSON.stringify({ status: "success", ident: "abc" }), { status: 200 });
  });
  assert.equal(calls, 1);
  assert.equal(sent.ok && sent.ref, "abc");
  const refused = await sendAirtimePurchase(prepared, "secret-key", async () => new Response(JSON.stringify({ status: "fail", message: "bad secret-key" }), { status: 400 }));
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.equal(refused.error.includes("secret-key"), false);
});

test("catalogue import never calls an airtime purchase and does not keep airtime rows", () => {
  assert.match(airtimeImportBlock("vtu-airtime", "") || "", /nothing was saved/i);
  assert.match(airtimeImportBlock("vtu-data", "https://smeapi.com.ng/api/airtime/") || "", /will not call it/i);
  assert.equal(airtimeImportBlock("vtu-data", "https://smeapi.com.ng/api/dataplans/?format=json"), null);
  assert.equal(vtuCatalogueUrl("https://smeapi.com.ng/api/airtime/"), null);
  assert.equal(vtuCatalogueUrl("https://smeapi.com.ng/api/data/"), "https://smeapi.com.ng/api/dataplans/?format=json");
  const kept = withoutAirtimeProducts([
    { category: "data", name: "MTN 1GB" },
    { category: "airtime", name: "MTN Airtime" },
  ]);
  assert.deepEqual(kept, [{ category: "data", name: "MTN 1GB" }]);
});

test("configured networks are saved without creating catalogue products", async () => {
  const { getSql } = await import("@/lib/db");
  const { listAirtimeRecords, saveAirtimeRouteRow } = await import("./airtime-rows.server.ts");
  const sql = await getSql();
  await sql.query("delete from shop_airtime_routes where network_id = 'air-mtn'");
  const before = await sql.query<{ count: string }>("select count(*)::text as count from shop_products where category = 'airtime'");
  const listed = await listAirtimeRecords();
  assert.deepEqual(listed.networks.map((item) => item.brand).sort(), ["9mobile", "airtel", "glo", "mtn"]);
  assert.equal(listed.networks.every((item) => item.enabled === false && item.profitNaira == null), true);
  assert.equal(listed.routes.length, 0);
  const saved = await saveAirtimeRouteRow({ ...smeRoute, id: "" });
  assert.equal(saved.error, null);
  const again = await listAirtimeRecords();
  const route = again.routes.find((item) => item.networkId === "air-mtn");
  assert.equal(route?.providerNetworkId, "1");
  assert.equal(route?.purchasePath, "/api/airtime/");
  assert.equal(route?.authPrefix, "Token");
  assert.equal(route?.enabled, true);
  const after = await sql.query<{ count: string }>("select count(*)::text as count from shop_products where category = 'airtime'");
  assert.equal(after[0]?.count, before[0]?.count);
  await sql.query("delete from shop_airtime_routes where network_id = 'air-mtn'");
});

