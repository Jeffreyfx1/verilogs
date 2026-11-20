import assert from "node:assert/strict";
import test from "node:test";
import { freshData } from "./catalog.ts";
import { attributeReferral, makeReferralCode, normalizeReferralCode, rewardDecision } from "./referral.ts";
import { registerUser } from "./shop-logic.ts";

test("referral codes stay unique", () => {
  const taken = new Set(["JEFFAB12"]);
  const code = makeReferralCode("Jeff", taken, "ab12");
  assert.notEqual(code, "JEFFAB12");
  assert.match(code, /^JEFF/);
});

test("referral code format accepts a shop code and rejects junk", () => {
  assert.deepEqual(normalizeReferralCode(""), { ok: true, code: "" });
  assert.deepEqual(normalizeReferralCode("  ada12xy "), { ok: true, code: "ADA12XY" });
  assert.equal(normalizeReferralCode("no").ok, false);
  assert.equal(normalizeReferralCode("bad code!").ok, false);
  assert.equal(normalizeReferralCode("thiscodeiswaytoolong").ok, false);
});

test("attribution keeps one referrer and rejects unknown or self codes", () => {
  const users = [{ id: "usr_ada", email: "ada@verilogs.test", referralCode: "ADA12XY" }];
  assert.deepEqual(attributeReferral({ code: "", email: "new@verilogs.test", users }), { error: null, referrerId: "", code: "" });
  assert.equal(attributeReferral({ code: "ADA12XY", email: "new@verilogs.test", users }).referrerId, "usr_ada");
  assert.match(attributeReferral({ code: "NOPE999", email: "new@verilogs.test", users }).error || "", /not valid/);
  assert.match(attributeReferral({ code: "ada", email: "new@verilogs.test", users }).error || "", /not valid/);
  assert.match(attributeReferral({ code: "ADA12XY", email: "ada@verilogs.test", users }).error || "", /own referral code/);
});

test("a reward is paid once and only when profit covers it", () => {
  const base = { enabled: true, reward: 100, minPurchase: 500, status: "pending", orderStatus: "completed", orderAmount: 1800, orderProfit: 300, alreadyRewarded: false };
  const paid = rewardDecision(base);
  assert.equal(paid.award, true);
  if (paid.award) assert.equal(paid.amount, 100);
  assert.equal(rewardDecision({ ...base, orderStatus: "waiting" }).award, false);
  assert.equal(rewardDecision({ ...base, orderProfit: 50 }).award, false);
  assert.equal(rewardDecision({ ...base, alreadyRewarded: true }).award, false);
  assert.equal(rewardDecision({ ...base, status: "rewarded" }).award, false);
  assert.equal(rewardDecision({ ...base, enabled: false }).award, false);
});

function shopWithReferrer() {
  const data = freshData();
  data.users.push({
    id: "usr_ada",
    name: "Ada",
    email: "ada@verilogs.test",
    phone: "+2348011111111",
    passwordHash: "hash",
    google: false,
    role: "customer",
    balance: 2500,
    createdAt: "2026-11-01T10:00:00.000Z",
    referralCode: "ADA12XY",
    referredBy: "usr_older",
  });
  return data;
}

const signup = { name: "Bola", email: "bola@verilogs.test", phone: "+2348022222222", password: "password1" };

test("registration without a code does not attach a referrer", async () => {
  const before = shopWithReferrer();
  const out = await registerUser(before, signup);
  assert.equal(out.error, null);
  const created = out.data.users.find((user) => user.email === signup.email);
  assert.equal(created?.referredBy, "");
  assert.notEqual(created?.referralCode, "ADA12XY");
  const ada = out.data.users.find((user) => user.id === "usr_ada");
  assert.equal(ada?.balance, 2500);
  assert.equal(ada?.referredBy, "usr_older");
});

test("registration with a real code stores one referrer and leaves the referrer unchanged", async () => {
  const before = shopWithReferrer();
  const out = await registerUser(before, { ...signup, referralCode: "ada12xy" });
  assert.equal(out.error, null);
  assert.equal(out.referrerId, "usr_ada");
  const created = out.data.users.find((user) => user.email === signup.email);
  assert.equal(created?.referredBy, "usr_ada");
  assert.equal(out.data.users.filter((user) => user.email === signup.email).length, 1);
  const ada = out.data.users.find((user) => user.id === "usr_ada");
  assert.equal(ada?.balance, 2500);
  assert.equal(ada?.referralCode, "ADA12XY");
  assert.equal(ada?.referredBy, "usr_older");
});

test("invalid codes and a second signup do not create a referral or another account", async () => {
  const before = shopWithReferrer();
  const invalid = await registerUser(before, { ...signup, referralCode: "NOPE999" });
  assert.match(invalid.error || "", /not valid/);
  assert.equal(invalid.data.users.some((user) => user.email === signup.email), false);
  const self = await registerUser(before, { ...signup, email: "ada@verilogs.test", referralCode: "ADA12XY" });
  assert.match(self.error || "", /already exists/);
  assert.equal(before.users.filter((user) => user.email === "ada@verilogs.test").length, 1);
  const first = await registerUser(before, { ...signup, referralCode: "ADA12XY" });
  const again = await registerUser(first.data, { ...signup, referralCode: "ADA12XY" });
  assert.match(again.error || "", /already exists/);
  assert.equal(again.data.users.filter((user) => user.email === signup.email).length, 1);
  assert.equal(again.data.users.find((user) => user.email === signup.email)?.referredBy, "usr_ada");
});
