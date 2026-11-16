import assert from "node:assert/strict";
import test from "node:test";
import { instakingCurrency, instakingOrderFields, parseInstakingServices, platformFromCategory } from "./instaking.ts";

const sample = [
  { service: 1, name: "Followers", type: "Default", category: "Instagram - Followers", rate: "0.90", min: "50", max: "10000", refill: true },
  { service: 2, name: "Comments", type: "Custom Comments", category: "Second Category", rate: "8", min: "10", max: "1500", refill: false },
  { service: 3, name: "Space", type: "Package", category: "Twitter/X - Spaces", rate: "1.20", min: "1", max: "1", refill: false },
];

test("Instaking services keep the provider id, per-1000 rate and category platform", () => {
  const items = parseInstakingServices(sample);
  assert.ok(items);
  assert.equal(items![0]?.externalId, "1");
  assert.equal(items![0]?.service, "1");
  assert.equal(items![0]?.name, "Followers");
  assert.equal(items![0]?.price, 0.0009);
  assert.equal(items![0]?.subcategory, "Instagram");
  assert.equal(items![0]?.smmMin, 50);
  assert.equal(items![0]?.smmMax, 10000);
  assert.equal(items![0]?.smmType, "Default");
  assert.equal(items![0]?.smmRefill, true);
  assert.equal(items![0]?.rate, -1);
  assert.equal(items![0]?.category, "smm");
  assert.equal(items![1]?.subcategory, "Other");
  assert.equal(items![1]?.price, 0.008);
  assert.equal(items![2]?.price, 1.2);
  assert.equal(items![2]?.subcategory, "X (Twitter)");
  assert.equal(platformFromCategory("TikTok → Likes"), "TikTok");
  assert.equal(platformFromCategory("Premium mailbox"), "Other");
});

test("order bodies send only the documented fields for that type", () => {
  const standard = instakingOrderFields("Default", "1", { link: "https://instagram.com/p/1", quantity: 100 });
  assert.deepEqual(standard, { action: "add", service: "1", link: "https://instagram.com/p/1", quantity: 100 });
  const comments = instakingOrderFields("Custom Comments", "2", { link: "https://instagram.com/p/1", comments: "Nice\nGreat" });
  assert.ok(!("error" in comments));
  assert.equal("quantity" in comments, false);
  const pack = instakingOrderFields("Package", "3", { link: "https://x.com/i/spaces/1", quantity: 50, comments: "nope" });
  assert.deepEqual(pack, { action: "add", service: "3", link: "https://x.com/i/spaces/1" });
  const poll = instakingOrderFields("Poll", "9", { link: "https://x.com/poll", quantity: 20, answerNumber: "2" });
  assert.equal("answer_number" in poll, true);
  const missing = instakingOrderFields("Default", "1", { quantity: 10 });
  assert.equal("error" in missing, true);
  assert.equal(instakingCurrency("USD"), "USD");
  assert.equal(instakingCurrency("NGN"), "NGN");
  assert.equal(instakingCurrency(""), "");
});
