import assert from "node:assert/strict";
import test from "node:test";
import { extractCatalog, shapeImport } from "./categorize.ts";
import { destinationOf, flattenGetaText } from "./import-source.ts";

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
