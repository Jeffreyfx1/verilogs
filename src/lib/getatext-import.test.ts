import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { extractCatalog, shapeImport } from "./categorize.ts";
import { readGetaTextPrices } from "./import-source.ts";
import { countExistingProducts, upsertProductRows } from "@/lib/product-rows.server";

const payload = [
  { service_name: "Whatsapp", api_name: "whatsapp", multiple_sms: "true", price: "0.55", ttl: 5, stock: 66, cashback: false },
  { service_name: "Telegram", api_name: "telegram", price: "0.45", ttl: 20, stock: 3, cashback: false },
];

test("GetaText services are saved with the provider cost and stock", async () => {
  const read = readGetaTextPrices(payload);
  assert.equal(read?.rows.length, 2);
  const items = shapeImport(extractCatalog(read?.rows).items, "usa", []);
  assert.equal(items.length, 2);
  const providerId = "prov-getatext-test";
  const products: Product[] = items.map((item, index) => ({
    id: `prd-gt-${index}`,
    providerId,
    externalId: item.externalId,
    category: item.category,
    name: item.name,
    service: item.service,
    country: item.country,
    network: item.network,
    price: Math.round(item.price * 1600) + 1500,
    cost: item.price,
    stock: item.stock,
    operator: item.operator,
    rate: item.rate,
    rates: item.rates,
    enabled: true,
    validity: item.validity,
    variable: item.variable,
    description: item.description,
    importType: item.importType,
    serverId: item.serverId,
  }));
  await upsertProductRows(products, "job-getatext-1");
  const saved = await countExistingProducts(providerId, items.map((item) => item.externalId));
  assert.equal(saved, 2);
  const sql = await getSql();
  const rows = await sql.query<{ name: string; service: string; cost: number; stock: number; category: string; external_id: string }>(
    "select name, service, cost, stock, category, external_id from shop_products where provider_id = $1 order by service",
    [providerId],
  );
  assert.equal(rows.length, 2);
  const telegram = rows.find((row) => row.service === "telegram");
  const whatsapp = rows.find((row) => row.service === "whatsapp");
  assert.equal(whatsapp?.name, "Whatsapp");
  assert.equal(whatsapp?.external_id, "whatsapp");
  assert.equal(Number(whatsapp?.cost), 0.55);
  assert.equal(Number(whatsapp?.stock), 66);
  assert.equal(whatsapp?.category, "usa");
  assert.equal(telegram?.name, "Telegram");
  assert.equal(Number(telegram?.stock), 3);
  assert.equal(rows.some((row) => row.service === "ttl" || row.external_id === "5"), false);
});
