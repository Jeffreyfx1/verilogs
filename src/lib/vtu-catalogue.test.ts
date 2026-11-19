import assert from "node:assert/strict";
import test from "node:test";
import { airtimeProductsFromPayload, attachVtuIds, extractCatalog, shapeImport, vtuCatalogueUrl } from "./categorize.ts";
import { networkValue, planValue } from "./fulfill.server.ts";

const sme = {
  status: "success",
  data: [
    { id: 1, network_id: 1, network: "MTN", name: "500MB", type: "SME2", days: "7days", price: 220 },
    { id: 2, network_id: 2, network: "GLO", name: "1GB", type: "SME", days: "30days", price: 450 },
    { id: 9, network_id: 4, network: "AIRTEL", name: "2GB", type: "Gifting", days: "30 days", price: 900 },
    { id: 10, network_id: 1, network: "MTN", name: "1GB", type: "Corporate", days: "30days", price: 500 },
    { network_id: 1, network: "MTN", name: "No id", type: "SME", days: "1day", price: 100 },
  ],
};

test("SME airtime uses real network ids and does not invent 9mobile", () => {
  const rows = airtimeProductsFromPayload(sme);
  const ids = rows.map((row) => row.operator).sort();
  assert.deepEqual(ids, ["1", "2", "4"]);
  assert.equal(rows.some((row) => row.operator === "3" || row.network === "9mobile"), false);
  assert.equal(rows.find((row) => row.operator === "1")?.externalId, "airtime|1|mtn");
  assert.equal(rows.find((row) => row.operator === "2")?.network, "Glo");
  assert.equal(rows.find((row) => row.operator === "4")?.network, "Airtel");
  assert.ok(rows.every((row) => row.service === "Airtime" && row.price === 0));
  assert.equal(rows.some((row) => row.externalId.includes("sme")), false);
});

test("SME data keeps the provider plan id, network id and price", () => {
  const extracted = extractCatalog(sme);
  const attached = attachVtuIds(sme, extracted.items);
  assert.notEqual(attached, extracted.items);
  const shaped = shapeImport(attached, "vtu-data", []);
  assert.equal(shaped.length, 4);
  const first = shaped.find((row) => row.externalId === "data|1");
  assert.ok(first);
  assert.equal(first?.operator, "1");
  assert.equal(first?.network, "MTN");
  assert.equal(first?.price, 220);
  assert.equal(first?.service, "SME2");
  assert.equal(first?.validity, "7days");
  assert.equal(first?.category, "data");
  assert.equal(shaped.find((row) => row.externalId === "data|2")?.operator, "2");
  assert.equal(shaped.find((row) => row.externalId === "data|2")?.network, "Glo");
  assert.equal(shaped.find((row) => row.externalId === "data|9")?.operator, "4");
  assert.equal(shaped.find((row) => row.externalId === "data|9")?.network, "Airtel");
  assert.equal(shaped.find((row) => row.externalId === "data|9")?.price, 900);
  assert.equal(shaped.some((row) => row.name.toLowerCase().includes("no id")), false);
  const mtn = shaped.filter((row) => row.network === "MTN");
  assert.equal(mtn.length, 2);
  assert.ok(mtn.every((row) => row.operator === "1"));
  assert.equal(shaped.some((row) => row.network === "MTN" && row.operator === "4"), false);
});

test("grouped and camelCase catalogues keep their own plan ids", () => {
  const grouped = {
    MTN: [{ plan_id: "501", network_id: "1", plan_name: "500MB", price: 220, month_validate: "30 days", plan_type: "SME" }],
    Airtel: [{ plan_id: "880", network_id: "4", plan_name: "1GB", price: 400, month_validate: "7days", plan_type: "Gifting" }],
  };
  const groupedItems = shapeImport(attachVtuIds(grouped, extractCatalog(grouped).items), "vtu-data", []);
  assert.equal(groupedItems.find((row) => row.externalId.endsWith("|501"))?.operator, "1");
  assert.equal(groupedItems.find((row) => row.externalId.endsWith("|501"))?.network, "MTN");
  assert.equal(groupedItems.find((row) => row.externalId.endsWith("|501"))?.price, 220);
  assert.equal(groupedItems.find((row) => row.externalId.endsWith("|880"))?.operator, "4");
  assert.equal(groupedItems.find((row) => row.externalId.endsWith("|880"))?.network, "Airtel");
  assert.equal(groupedItems.some((row) => row.network === "MTN" && row.operator === "4"), false);

  const ogdams = {
    plans: [{ networkId: 3, planId: "mtn_sme_500mb", name: "Glo 500MB", price: 150, validity: "30days" }],
  };
  const ogdamItems = shapeImport(attachVtuIds(ogdams, extractCatalog(ogdams).items), "vtu-data", []);
  const plan = ogdamItems.find((row) => row.externalId.endsWith("|mtn_sme_500mb"));
  assert.ok(plan);
  assert.equal(plan?.operator, "3");
  assert.equal(plan?.price, 150);
  assert.equal(planValue(plan?.externalId || ""), "mtn_sme_500mb");
  assert.notEqual(planValue(plan?.externalId || ""), 500);
});

test("a mailbox is not turned into a data plan", () => {
  const mailbox = { items: [{ id: "acct-1", name: "Premium mailbox", description: "Inbox", price: 2500, service: "Mailbox" }] };
  const extracted = extractCatalog(mailbox);
  const attached = attachVtuIds(mailbox, extracted.items);
  assert.equal(attached, extracted.items);
  const shaped = shapeImport(attached, "vtu-data", []);
  assert.equal(shaped[0]?.category, "data");
  assert.equal(shaped[0]?.price, 2500);
});

test("airtime types are recorded only when the row is not a priced data plan", () => {
  const rows = airtimeProductsFromPayload([
    { network_id: 1, network: "MTN", type: "VTU" },
    { network_id: 1, network: "MTN", type: "Share" },
  ]);
  assert.deepEqual(rows.map((row) => row.externalId).sort(), ["airtime|1|share", "airtime|1|vtu"]);
  assert.equal(rows.every((row) => row.operator === "1"), true);
});

test("purchase urls are not used as catalogue urls", () => {
  assert.equal(vtuCatalogueUrl("https://smeapi.com.ng/api/airtime/"), "https://smeapi.com.ng/api/dataplans/?format=json");
  assert.equal(vtuCatalogueUrl("https://smeapi.com.ng/api/data"), "https://smeapi.com.ng/api/dataplans/?format=json");
  assert.equal(vtuCatalogueUrl("https://smeapi.com.ng/api/dataplans/"), null);
  assert.equal(vtuCatalogueUrl("https://example.com/api/airtime/"), null);
  assert.equal(vtuCatalogueUrl("https://example.com/api/data/"), null);
});

test("purchase ids are the saved provider ids", () => {
  assert.equal(planValue("data|2"), 2);
  assert.equal(networkValue({ operator: "1", network: "MTN" }, "smeapi.com.ng"), 1);
  assert.equal(planValue("data|mtn_sme_500mb"), "mtn_sme_500mb");
  assert.equal(networkValue({ operator: "", network: "MTN" }, "api.other.test"), 0);
  assert.equal(networkValue({ operator: "", network: "9mobile" }, "smeapi.com.ng"), 0);
  assert.equal(networkValue({ operator: "", network: "MTN" }, "www.smeapi.com.ng"), 1);
  assert.equal(networkValue({ operator: "mtn", network: "MTN" }, "smeapi.com.ng"), 0);
});
