import assert from "node:assert/strict";
import test from "node:test";
import { effectiveRentRate, fiveSimBuyUrl, flagEmoji, groupRentOffers, parseFiveSimCountries, parseFiveSimOperatorPrices, parseFiveSimProducts, pickRentVariant, rentCharge, rentSearchHit, type RentVariant } from "./rent.ts";

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

test("rent number price uses its own rate and margin per dollar", () => {
  const pricing = { usdNgn: 1500, marginPerUsd: 100, marginEnabled: true };
  assert.equal(rentCharge(2, pricing), 3200);
  assert.equal(rentCharge(2, { ...pricing, marginEnabled: false }), 3000);
  assert.equal(rentCharge(2, { usdNgn: 1500, marginPerUsd: 100, marginEnabled: true }), 3200);
  assert.notEqual(rentCharge(2, pricing), 3100);
  assert.equal(rentCharge(0.8974, { usdNgn: 1500, marginPerUsd: 100, marginEnabled: true }), 1436);
  assert.equal(rentCharge(2, { usdNgn: 0, marginPerUsd: 100, marginEnabled: true }), null);
  assert.equal(effectiveRentRate(pricing), 1600);
  assert.equal(effectiveRentRate({ ...pricing, marginEnabled: false }), 1500);
});

function variant(patch: Partial<RentVariant> & Pick<RentVariant, "id" | "service" | "operator">): RentVariant {
  return { country: "england", kind: "activation", priceUsd: 1, stock: 1, rate: null, ...patch };
}

test("operators of one service become one entry and unrelated names stay apart", () => {
  const rows = [
    variant({ id: "a", service: "whatsapp", operator: "virtual53", priceUsd: 1, stock: 185, rate: 9.09 }),
    variant({ id: "b", service: "whatsapp", operator: "virtual59", priceUsd: 0.7, stock: 0, rate: 23 }),
    variant({ id: "c", service: "whatsapp", operator: "virtual34", priceUsd: 0.95, stock: 2000, rate: null }),
    variant({ id: "d", service: "whatsapp", operator: "any", priceUsd: 0.5, stock: 90, rate: 50 }),
    variant({ id: "e", service: "google", operator: "virtual8", priceUsd: 0.2, stock: 10, rate: null }),
    variant({ id: "f", service: "googlevoice", operator: "virtual8", priceUsd: 0.4, stock: 4, rate: null }),
  ];
  const groups = groupRentOffers(rows);
  assert.deepEqual(groups.map((group) => group.label).sort(), ["Google", "Googlevoice", "Whatsapp"]);
  const whatsapp = groups.find((group) => group.chosen.service === "whatsapp");
  assert.equal(whatsapp?.chosen.id, "a");
  assert.equal(whatsapp?.variants, 4);
  const unrated = [
    variant({ id: "low", service: "telegram", operator: "virtual2", priceUsd: 1, stock: 10 }),
    variant({ id: "high", service: "telegram", operator: "virtual4", priceUsd: 3, stock: 40 }),
    variant({ id: "cheap", service: "telegram", operator: "virtual5", priceUsd: 0.5, stock: 40 }),
  ];
  assert.equal(pickRentVariant(unrated)?.id, "cheap");
  const merged = groupRentOffers([
    variant({ id: "w", service: "whatsapp", operator: "virtual8", label: "WhatsApp" }),
    variant({ id: "x", service: "wa", operator: "virtual8", label: "WhatsApp", priceUsd: 2 }),
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].label, "WhatsApp");
});

test("operator prices keep a zero success rate as unknown", () => {
  const rows = parseFiveSimOperatorPrices({
    england: {
      whatsapp: {
        virtual34: { cost: 0.95, count: 20, rate: 0 },
        virtual53: { cost: 1, count: 5, rate: 9.09 },
        empty: { cost: 1, count: 0, rate: 40 },
      },
      google: { virtual8: { cost: 0.2, count: 3, rate: 0 } },
    },
  }, "england");
  assert.equal(rows.length, 4);
  assert.equal(rows.find((row) => row.operator === "virtual34")?.rate, null);
  assert.equal(rows.find((row) => row.operator === "virtual53")?.rate, 9.09);
  assert.equal(new Set(rows.map((row) => row.service)).size, 2);
});

test("search matches partial country and service names", () => {
  assert.equal(rentSearchHit("England", "eng"), true);
  assert.equal(rentSearchHit("England", "ENG"), true);
  assert.equal(rentSearchHit("England", "land"), true);
  assert.equal(rentSearchHit("England", "nigeria"), false);
  assert.equal(rentSearchHit("Whatsapp", "what"), true);
  assert.equal(rentSearchHit("Whatsapp", ""), true);
  assert.equal(flagEmoji("gb"), "🇬🇧");
  assert.equal(flagEmoji("england"), "");
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
