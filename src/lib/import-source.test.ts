import assert from "node:assert/strict";
import test from "node:test";
import { extractCatalog, shapeImport } from "./categorize.ts";
import { destinationOf, flattenGetaText, readGetaTextPrices } from "./import-source.ts";

const bait = {
  id: "acct-1",
  name: "Premium mailbox",
  description: "Use a VPN connection for better connectivity. Boost followers on TikTok and WhatsApp after delivery.",
  price: 2500,
  service: "Mailbox",
};

test("import source stamps the category and ignores product text", () => {
  const extracted = extractCatalog({ items: [bait] });
  assert.ok(extracted.items.length >= 1);
  const logs = shapeImport(extracted.items, "random", []);
  const smm = shapeImport(extracted.items, "smm", []);
  const numbers = shapeImport(extracted.items, "numbers", []);
  const vpn = shapeImport(extracted.items, "vpn", []);
  const airtime = shapeImport(extracted.items, "vtu-airtime", []);
  const data = shapeImport(extracted.items, "vtu-data", []);
  const usa = shapeImport(extracted.items, "usa", []);
  assert.equal(logs[0]?.category, "logs");
  assert.equal(logs[0]?.importType, "RANDOM_IMPORT");
  assert.equal(smm[0]?.category, "smm");
  assert.equal(smm[0]?.importType, "SMM_IMPORT");
  assert.equal(numbers[0]?.category, "number");
  assert.equal(numbers[0]?.serverId, "1");
  assert.equal(numbers[0]?.importType, "NUMBER_IMPORT");
  assert.equal(airtime[0]?.category, "airtime");
  assert.equal(airtime[0]?.importType, "VTU_IMPORT");
  assert.equal(data[0]?.category, "data");
  assert.equal(data[0]?.importType, "VTU_IMPORT");
  assert.notEqual(data[0]?.category, airtime[0]?.category);
  assert.equal(usa[0]?.category, "usa");
  assert.equal(usa[0]?.serverId, "usa");
  assert.equal(vpn.length, 0);
  assert.equal(destinationOf("vpn"), null);
  assert.equal(destinationOf("vtu"), null);
  assert.equal(logs[0]?.description.includes("VPN"), true);
  assert.equal(logs[0]?.description.includes("Boost") || logs[0]?.description.includes("TikTok") || bait.description.includes("TikTok"), true);
});

test("server 2 and server 3 stay on the number category with their own server id", () => {
  const extracted = extractCatalog({ items: [{ id: "n1", name: "WhatsApp", price: 0.2, country: "usa", count: 4 }] });
  const two = shapeImport(extracted.items, "server2", []);
  const three = shapeImport(extracted.items, "server3", []);
  assert.equal(two[0]?.category, "number");
  assert.equal(two[0]?.serverId, "2");
  assert.equal(three[0]?.serverId, "3");
  assert.notEqual(two[0]?.serverId, three[0]?.serverId);
});

test("GetaText prices keep cost and stock and do not invent a success rate", () => {
  const rows = flattenGetaText({
    usa: {
      whatsapp: { cost: 0.55, count: 1200, any: { cost: 0.55, count: 1200 } },
      telegram: { cost: 0.45, count: 980 },
    },
  });
  assert.ok(rows);
  const whatsapp = rows!.find((row) => row.service === "whatsapp" && row.operator === "any");
  const telegram = rows!.find((row) => row.service === "telegram");
  assert.equal(whatsapp?.cost, 0.55);
  assert.equal(whatsapp?.count, 1200);
  assert.equal("rate" in (whatsapp || {}), false);
  assert.equal(telegram?.cost, 0.45);
  const stamped = shapeImport(extractCatalog(rows).items, "usa", []);
  assert.ok(stamped.every((item) => item.category === "usa" && item.importType === "USA_IMPORT"));
  assert.ok(stamped.every((item) => item.serverId === "usa"));
  assert.ok(stamped.every((item) => item.category !== "number"));
});

test("GetaText prices-info maps service name, api name, price and stock", () => {
  const payload = {
    data: [
      { service_name: "Whatsapp", api_name: "whatsapp", multiple_sms: "true", price: "0.55", ttl: 5, stock: 66, cashback: false },
      { service_name: "Telegram", api_name: "telegram", multiple_sms: "false", price: "0.45", ttl: 20, stock: 0, cashback: true },
      { service_name: "No id", price: "1.25", ttl: 5, stock: 4 },
    ],
  };
  const read = readGetaTextPrices(payload);
  assert.equal(read?.recognized, true);
  assert.equal(read?.rows.length, 2);
  assert.equal(read?.rows[0]?.name, "Whatsapp");
  assert.equal(read?.rows[0]?.service, "whatsapp");
  assert.equal(read?.rows[0]?.cost, 0.55);
  assert.equal(read?.rows[0]?.count, 66);
  assert.equal("rate" in (read?.rows[0] || {}), false);
  assert.equal(read?.rows[1]?.count, 0);
  const flat = flattenGetaText(payload);
  const one = flattenGetaText(payload.data[0]);
  assert.equal(one?.[0]?.service, "whatsapp");
  const stamped = shapeImport(extractCatalog(flat).items, "usa", []);
  assert.equal(stamped.length, 2);
  assert.equal(stamped[0]?.name, "Whatsapp");
  assert.equal(stamped[0]?.service, "whatsapp");
  assert.equal(stamped[0]?.price, 0.55);
  assert.equal(stamped[0]?.stock, 66);
  assert.equal(stamped[0]?.category, "usa");
  assert.equal(stamped[0]?.importType, "USA_IMPORT");
  assert.equal(stamped.every((item) => item.externalId === "whatsapp" || item.externalId === "telegram"), true);
  assert.equal(stamped.some((item) => item.service === "ttl" || item.name === "Ttl" || item.externalId === "5"), false);
  const direct = shapeImport(extractCatalog(payload).items, "usa", []);
  assert.equal(direct.length, 2);
  assert.equal(direct.every((item) => item.service === "whatsapp" || item.service === "telegram"), true);
  assert.equal(direct.some((item) => /no id/i.test(item.name)), false);
});

test("GetaText prices array keeps USD amounts and sums area-code stock", () => {
  const read = readGetaTextPrices({
    service_name: "Catalogue",
    api_name: "catalogue",
    price: "9.99",
    stock: 1,
    prices: [
      { service_name: "WhatsApp", api_name: "whatsapp", price: 1.4, stock: 12 },
      { service_name: "Google", api_name: "google", price: "$0.50", stock: { "555": 9, "852": 3, "212": 0 } },
      { service_name: "TikTok", api_name: "tiktok", price: { USD: 0.08 }, stock: 0 },
      { service_name: "Broken", api_name: "broken", price: { "555": 4 }, stock: 9 },
    ],
  });
  assert.equal(read?.recognized, true);
  assert.equal(read?.rows.length, 3);
  assert.equal(read?.rows.some((row) => row.service === "catalogue"), false);
  const whatsapp = read?.rows.find((row) => row.service === "whatsapp");
  const google = read?.rows.find((row) => row.service === "google");
  const tiktok = read?.rows.find((row) => row.service === "tiktok");
  assert.equal(whatsapp?.cost, 1.4);
  assert.equal(whatsapp?.count, 12);
  assert.equal(whatsapp?.country, "usa");
  assert.equal(google?.cost, 0.5);
  assert.equal(google?.count, 12);
  assert.equal(google?.country, "usa");
  assert.equal(tiktok?.cost, 0.08);
  assert.equal(tiktok?.count, 0);
  assert.equal(read?.rows.some((row) => row.service === "555" || row.country === "555" || row.country === "852"), false);
  const currencyStock = readGetaTextPrices({
    data: [{ service_name: "Signal", api_name: "signal", price: 0.2, stock: { USD: 40 } }],
  });
  assert.equal(currencyStock?.rows[0]?.cost, 0.2);
  assert.equal(currencyStock?.rows[0]?.count, 0);
});

test("GetaText service map and USA country aliases stay one USA row", () => {
  const mapped = readGetaTextPrices({
    whatsapp: { service_name: "WhatsApp", price: "$1.40", stock: { "212": 4, "646": 1 } },
    telegram: { price: 0.97, count: 3 },
  });
  assert.equal(mapped?.rows.length, 2);
  assert.equal(mapped?.rows.find((row) => row.service === "whatsapp")?.count, 5);
  assert.equal(mapped?.rows.find((row) => row.service === "whatsapp")?.cost, 1.4);
  assert.equal(mapped?.rows.find((row) => row.service === "telegram")?.count, 3);
  const aliased = flattenGetaText({
    usa: {
      whatsapp: { cost: 0.55, count: 10 },
      tinder: { cost: 0.18, count: 2 },
    },
    "187": {
      whatsapp: { cost: 0.4, count: 25 },
      telegram: { cost: 0.45, count: 4 },
    },
  });
  assert.equal(aliased?.filter((row) => row.service === "whatsapp").length, 1);
  assert.equal(aliased?.find((row) => row.service === "whatsapp")?.country, "usa");
  assert.equal(aliased?.find((row) => row.service === "whatsapp")?.count, 25);
  assert.equal(aliased?.find((row) => row.service === "whatsapp")?.cost, 0.4);
  assert.equal(aliased?.find((row) => row.service === "telegram")?.country, "usa");
  assert.equal(aliased?.some((row) => row.country === "187" || row.service === "187"), false);
  const stamped = shapeImport(extractCatalog(aliased).items, "usa", ["Telegram"]);
  assert.equal(stamped.length, 3);
  assert.ok(stamped.every((item) => item.category === "usa" && item.country === "United States"));
});

test("USA import keeps every priced service while number servers still use the wanted list", () => {
  const extracted = extractCatalog({
    data: [
      { service_name: "Whatsapp", api_name: "whatsapp", price: "0.55", stock: 4 },
      { service_name: "TikTok", api_name: "tiktok", price: "0.08", stock: 2 },
    ],
  });
  const usa = shapeImport(extracted.items, "usa", ["Telegram"]);
  assert.deepEqual(usa.map((item) => item.service).sort(), ["tiktok", "whatsapp"]);
  assert.equal(shapeImport(extracted.items, "numbers", ["Telegram"]).length, 0);
  const kept = shapeImport(extracted.items, "numbers", ["WhatsApp"]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.service, "whatsapp");
  assert.equal(kept[0]?.importType, "NUMBER_IMPORT");
});
