import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "@/lib/catalog";
import {
  discoverServiceNames,
  extractCatalog,
  fiveSimImportPlan,
  fiveSimReconcileMessage,
  mergeServiceNames,
  readFiveSimCatalogue,
  savedProductCount,
  shapeImport,
  slimFiveSim,
} from "./categorize.ts";
import { getSql } from "@/lib/db";
import { FIVESIM_SEARCH_LIMIT, NUMBER_LIST_LIMIT, countExistingProducts, upsertProductRows } from "@/lib/product-rows.server";

const quote = (cost: number, count: number, rate = 80) => ({ cost, count, rate, rate24: 70 });

const fullCatalogue = {
  data: {
    nigeria: {
      whatsapp: {
        virtual21: quote(1.2, 4),
        any: quote(0.5, 0),
      },
      telegram: {
        virtual8: quote(0.4, 2),
      },
      deadapp: {
        virtual4: quote(0.2, 0),
      },
    },
    england: {
      whatsapp: {
        virtual51: quote(2, 9),
      },
    },
  },
};

const productCatalogue = {
  whatsapp: {
    nigeria: { virtual21: quote(1.2, 4) },
    england: { virtual51: quote(2, 0) },
  },
};

function offers(payload: unknown) {
  const slim = slimFiveSim(payload);
  const extracted = extractCatalog(slim);
  return shapeImport(extracted.items, "numbers", []);
}

test("a bare 5sim prices URL is one GET and does not require saved service names", () => {
  assert.equal(fiveSimImportPlan("https://5sim.net/v1/guest/prices", []), "get");
  assert.equal(fiveSimImportPlan("https://5sim.net/v1/guest/prices", ["WhatsApp"]), "fanout");
  assert.equal(fiveSimImportPlan("https://5sim.net/v1/guest/prices?product=whatsapp", []), "other");
});

test("the full country → service → operator catalogue discovers services without manual names", () => {
  const items = offers(fullCatalogue);
  const services = [...new Set(items.map((item) => item.service))].sort();
  assert.deepEqual(services, ["Telegram", "WhatsApp"]);
  assert.equal(items.some((item) => item.service === "nigeria" || item.country === "whatsapp"), false);
  assert.equal(items.some((item) => item.service.toLowerCase() === "deadapp"), false);
  const nigeria = items.find((item) => item.service === "WhatsApp" && item.country === "Nigeria");
  assert.equal(nigeria?.operator, "virtual21");
  assert.equal(nigeria?.stock, 4);
  assert.ok((nigeria?.price || 0) > 0);
  const names = discoverServiceNames(fullCatalogue).sort();
  assert.deepEqual(names, ["deadapp", "telegram", "whatsapp"]);
  assert.deepEqual(mergeServiceNames(["WhatsApp", "Google"], names), ["WhatsApp", "Google", "deadapp", "telegram"]);
  assert.equal(mergeServiceNames(["WhatsApp"], ["whatsapp", "WhatsApp"]).length, 1);
});

test("Telegram for Canada keeps the 5sim service id and is not hidden by the old 100-name page", () => {
  const countryTree = {
    canada: {
      telegram: {
        virtual8: quote(0.359, 26995),
        virtual2: quote(0.49, 0),
      },
      whatsapp: { virtual12: quote(0.53, 40) },
    },
  };
  const productTree = { telegram: { canada: { virtual12: quote(0.6, 77640), virtual58: quote(1.3, 0) } } };
  const audit = readFiveSimCatalogue(countryTree);
  assert.ok(audit);
  assert.equal(audit.understood, true);
  assert.equal(audit.lost.length, 0);
  assert.equal(audit.stocked, audit.rows.length);
  assert.equal(audit.unavailable, 1);
  assert.match(fiveSimReconcileMessage(audit), /out of stock not listed/);
  const fromCountry = offers(countryTree).filter((item) => item.service === "Telegram" && item.country === "Canada");
  const fromProduct = offers(productTree).filter((item) => item.service === "Telegram" && item.country === "Canada");
  assert.equal(fromCountry.length, 1);
  assert.equal(fromCountry[0]?.operator, "virtual8");
  assert.equal(fromCountry[0]?.externalId, "canada|telegram|virtual8");
  assert.equal(fromCountry[0]?.serverId, "1");
  assert.equal(fromProduct.length, 1);
  assert.equal(fromProduct[0]?.externalId, "canada|telegram|virtual12");
  assert.equal(fromProduct[0]?.stock, 77640);
  const names = Array.from({ length: 216 }, (_, index) => `name-${String(index).padStart(3, "0")}`);
  names[179] = "Telegram";
  assert.equal(names.slice(0, 100).includes("Telegram"), false);
  assert.equal(FIVESIM_SEARCH_LIMIT, 500);
  assert.equal(names.slice(0, FIVESIM_SEARCH_LIMIT).includes("Telegram"), true);
  assert.ok(NUMBER_LIST_LIMIT >= 831);
});

test("a product-filtered 5sim response and an array of products still import", () => {
  const nested = offers(productCatalogue);
  assert.equal(nested.length, 1);
  assert.equal(nested[0]?.service, "WhatsApp");
  assert.equal(nested[0]?.country, "Nigeria");
  const listed = offers([{ id: "ng|gmail|any", service: "Gmail", name: "Gmail", country: "Nigeria", operator: "any", cost: 3, count: 6 }]);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.service, "Gmail");
  assert.equal(listed[0]?.externalId.includes("gmail"), true);
});

test("success is not reported unless products were saved", () => {
  assert.equal(savedProductCount(null), 0);
  assert.equal(savedProductCount({ created: 0, updated: 0 }), 0);
  assert.equal(savedProductCount({ created: 2, updated: 1 }), 3);
});

test("GET https://5sim.net/v1/guest/prices returns stocked numbers for a real product", async () => {
  const res = await fetch("https://5sim.net/v1/guest/prices?product=whatsapp");
  assert.equal(res.status, 200);
  const body = (await res.json()) as unknown;
  const items = offers(body);
  assert.ok(items.length > 0);
  assert.equal(items.every((item) => item.service === "WhatsApp"), true);
  assert.equal(items.every((item) => item.stock > 0 && item.price > 0), true);
  assert.equal(items.some((item) => item.country === "whatsapp"), false);
  assert.ok(discoverServiceNames(body).includes("whatsapp"));
});

test("imported 5sim rows are saved once and a disabled row stays disabled", async () => {
  const items = offers(fullCatalogue);
  assert.ok(items.length >= 2);
  const providerId = "prov-5sim-test";
  const products = (enabled: boolean): Product[] => items.map((item, index) => ({
    id: `prd-5sim-${index}`,
    providerId,
    externalId: item.externalId,
    category: item.category,
    name: item.name,
    service: item.service,
    country: item.country,
    network: item.network,
    price: 1500,
    cost: item.price,
    stock: item.stock,
    operator: item.operator,
    rate: item.rate,
    rates: item.rates,
    enabled,
    validity: "",
    variable: false,
    description: item.description,
    importType: item.importType,
    serverId: item.serverId,
  }));
  await upsertProductRows(products(false), "job-5sim-1");
  const first = await countExistingProducts(providerId, items.map((item) => item.externalId));
  assert.equal(first, items.length);
  await upsertProductRows(products(true), "job-5sim-2");
  const second = await countExistingProducts(providerId, items.map((item) => item.externalId));
  assert.equal(second, items.length);
  const sql = await getSql();
  const rows = await sql.query<{ enabled: boolean; n: number }>(
    "select count(*)::int as n, bool_and(enabled) as enabled from shop_products where provider_id = $1",
    [providerId],
  );
  assert.equal(Number(rows[0]?.n), items.length);
  assert.equal(rows[0]?.enabled, false);
  assert.equal(savedProductCount({ created: first, updated: 0 }) > 0, true);
});
