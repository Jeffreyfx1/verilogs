import assert from "node:assert/strict";
import test from "node:test";
import { customerPrice, defaultPricing, successRateOf } from "./pricing.ts";

const pricing = defaultPricing();

test("markup percent is applied after naira conversion", () => {
  const quote = customerPrice({
    cost: 1000,
    currency: "NGN",
    usdRate: 2646,
    successRate: null,
    pricing: { ...pricing, auto: false },
    defaultPercent: 35,
  });
  assert.equal(quote.price, 1350);
  assert.equal(quote.profit, 350);
  assert.equal(quote.reason, "default");
});

test("a higher success rate uses a higher tier", () => {
  const high = customerPrice({ cost: 1000, currency: "NGN", usdRate: 1, successRate: 97, pricing, defaultPercent: 12 });
  const mid = customerPrice({ cost: 1000, currency: "NGN", usdRate: 1, successRate: 82, pricing, defaultPercent: 12 });
  const low = customerPrice({ cost: 1000, currency: "NGN", usdRate: 1, successRate: 10, pricing, defaultPercent: 12 });
  assert.equal(high.percent, 35);
  assert.equal(high.price, 1350);
  assert.equal(mid.percent, 25);
  assert.equal(low.percent, 15);
  assert.ok(high.price > mid.price && mid.price > low.price);
});

test("a missing or invalid success rate does not take the top tier", () => {
  for (const successRate of [null, successRateOf(undefined), successRateOf(""), successRateOf("nope"), successRateOf(140), successRateOf(-1)]) {
    const quote = customerPrice({ cost: 1000, currency: "NGN", usdRate: 1, successRate, pricing, defaultPercent: 12 });
    assert.equal(quote.percent, 12);
    assert.equal(quote.price, 1120);
    assert.equal(quote.reason, "default");
    assert.equal(quote.tierId, null);
  }
});

test("an explicit zero success rate is the low tier, not missing", () => {
  const quote = customerPrice({ cost: 1000, currency: "NGN", usdRate: 1, successRate: successRateOf(0), pricing, defaultPercent: 12 });
  assert.equal(quote.percent, 15);
  assert.equal(quote.reason, "tier");
});

test("dollar prices convert before the markup", () => {
  const quote = customerPrice({ cost: 0.1, currency: "USD", usdRate: 1000, successRate: 96, pricing, defaultPercent: 12 });
  assert.equal(quote.purchaseNgn, 100);
  assert.equal(quote.percent, 35);
  assert.equal(quote.price, 135);
});

test("a service override beats the success-rate tier", () => {
  const quote = customerPrice({
    cost: 1000,
    currency: "NGN",
    usdRate: 1,
    successRate: 99,
    pricing: {
      ...pricing,
      overrides: [{ id: "wa", providerId: "p1", service: "WhatsApp", markupPercent: 10, minProfit: 0, enabled: true }],
    },
    providerId: "p1",
    service: "WhatsApp",
    defaultPercent: 12,
  });
  assert.equal(quote.percent, 10);
  assert.equal(quote.price, 1100);
  assert.equal(quote.reason, "override");
});

test("turning automatic tiers off uses the default percent", () => {
  const quote = customerPrice({
    cost: 1000,
    currency: "NGN",
    usdRate: 1,
    successRate: 99,
    pricing: { ...pricing, auto: false },
    defaultPercent: 12,
  });
  assert.equal(quote.price, 1120);
  assert.equal(quote.reason, "default");
});
