import assert from "node:assert/strict";
import test from "node:test";
import { fiveSimBuyUrl, parseFiveSimCountries, parseFiveSimProducts } from "./rent.ts";

test("country parser keeps only named FiveSim rows", () => {
  const rows = parseFiveSimCountries({
    england: { iso: { gb: 1 }, prefix: { "+44": 1 }, text_en: "England", text_ru: "Англия" },
    "": { text_en: "Blank" },
    mystery: { iso: { xx: 1 } },
    bad: "nope",
  });
  assert.deepEqual(rows, [{ slug: "england", name: "England", iso: "gb", prefix: "+44" }]);
});

test("product parser drops empty stock, bad prices, and unknown categories", () => {
  const rows = parseFiveSimProducts({
    whatsapp: { Category: "activation", Price: 0.12, Qty: 4 },
    telegram: { Category: "hosting", Price: 1.5, Qty: 2 },
    empty: { Category: "activation", Price: 1, Qty: 0 },
    free: { Category: "activation", Price: 0, Qty: 3 },
    other: { Category: "rent", Price: 9, Qty: 9 },
  }, "england", "any");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].service, "whatsapp");
  assert.equal(rows[0].kind, "activation");
  assert.equal(rows[1].kind, "hosting");
  assert.equal(new Set(rows.map((row) => `${row.country}|${row.service}|${row.kind}`)).size, 2);
});

test("buy url uses hosting only when the stored kind is hosting", () => {
  assert.equal(
    fiveSimBuyUrl({ kind: "activation", country: "england", operator: "any", service: "whatsapp" }),
    "https://5sim.net/v1/user/buy/activation/england/any/whatsapp",
  );
  assert.equal(
    fiveSimBuyUrl({ kind: "hosting", country: "england", operator: "any", service: "telegram" }),
    "https://5sim.net/v1/user/buy/hosting/england/any/telegram",
  );
});

test("live guest catalogue is parsed and no buy is called", async () => {
  const countriesRes = await fetch("https://5sim.net/v1/guest/countries", { headers: { Accept: "application/json", "User-Agent": "VeriLogs" } });
  assert.equal(countriesRes.status, 200);
  const countries = parseFiveSimCountries(await countriesRes.json());
  assert.ok(countries.length > 50);
  assert.ok(countries.some((row) => row.slug === "england" && row.name));
  const productsRes = await fetch("https://5sim.net/v1/guest/products/england/any", { headers: { Accept: "application/json", "User-Agent": "VeriLogs" } });
  assert.equal(productsRes.status, 200);
  const offers = parseFiveSimProducts(await productsRes.json(), "england", "any");
  assert.ok(offers.length > 0);
  assert.ok(offers.every((row) => (row.kind === "activation" || row.kind === "hosting") && row.priceUsd > 0 && row.stock > 0));
  assert.equal(offers.some((row) => row.country !== "england"), false);
});
