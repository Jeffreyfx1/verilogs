import assert from "node:assert/strict";
import test from "node:test";
import { customerPrice, profitFor, profitsOf, sellQuote, summarizeProfit } from "./pricing.ts";

test("general profit is added once after naira conversion", () => {
  const quote = sellQuote({ category: "logs", unitCost: 10, currency: "USD", usdRate: 500, quantity: 1 });
  assert.equal(quote.ok && quote.costNgn, 5000);
  assert.equal(quote.ok && quote.profit, 1500);
  assert.equal(quote.ok && quote.charge, 6500);
});

test("quantity adds provider cost repeatedly and profit once", () => {
  const quote = sellQuote({ category: "smm", unitCost: 2, currency: "NGN", usdRate: 1, quantity: 1000 });
  assert.equal(quote.ok && quote.costNgn, 2000);
  assert.equal(quote.ok && quote.charge, 3500);
});

test("airtime and data profits stay independent", () => {
  const profits = profitsOf({ general: 1500, airtime: 300, data: 400 });
  assert.equal(profitFor("airtime", profits), 300);
  assert.equal(profitFor("data", profits), 400);
  assert.equal(profitFor("logs", profits), 1500);
  const airtime = sellQuote({ category: "airtime", unitCost: 0, currency: "NGN", usdRate: 1, variable: true, face: 1000, profits });
  const data = sellQuote({ category: "data", unitCost: 800, currency: "NGN", usdRate: 1, profits });
  assert.equal(airtime.ok && airtime.charge, 1300);
  assert.equal(data.ok && data.charge, 1200);
});

test("a missing dollar rate does not invent a price", () => {
  const quote = customerPrice({ cost: 1, currency: "USD", usdRate: 0, category: "number" });
  assert.equal(quote.price, 0);
});

test("negative profit settings fall back to the defaults", () => {
  assert.deepEqual(profitsOf({ general: -5, airtime: 300, data: Number.NaN }), { general: 1500, airtime: 300, data: 300 });
});

test("profit report uses stored cost and skips unverified orders", () => {
  const report = summarizeProfit([
    { status: "completed", amount: 6500, cost: 5000, category: "logs", server: "" },
    { status: "completed", amount: 1800, cost: 1500, category: "airtime", server: "" },
    { status: "completed", amount: 2000, cost: 0, category: "smm", server: "" },
    { status: "waiting", amount: 4000, cost: 2500, category: "number", server: "Server 1" },
    { status: "refunded", amount: 4000, cost: 2500, category: "number", server: "Server 2" },
    { status: "completed", amount: 3000, cost: 1500, category: "number", server: "Server 3" },
  ]);
  assert.equal(report.total, 1500 + 300 + 1500);
  assert.equal(report.unverified, 1);
  assert.equal(report.rows.find((row) => row.category === "Number Server 3")?.profit, 1500);
  assert.equal(report.rows.find((row) => row.category === "Number Server 1")?.profit, 0);
});
