import assert from "node:assert/strict";
import test from "node:test";
import { makeReferralCode, rewardDecision } from "./referral.ts";

test("referral codes stay unique", () => {
  const taken = new Set(["JEFFAB12"]);
  const code = makeReferralCode("Jeff", taken, "ab12");
  assert.notEqual(code, "JEFFAB12");
  assert.match(code, /^JEFF/);
});

test("a reward is paid once and only when profit covers it", () => {
  const base = { enabled: true, reward: 100, minPurchase: 500, status: "pending", orderStatus: "completed", orderAmount: 1800, orderProfit: 300, alreadyRewarded: false };
  assert.equal(rewardDecision(base).award, true);
  assert.equal(rewardDecision({ ...base, orderStatus: "waiting" }).award, false);
  assert.equal(rewardDecision({ ...base, orderProfit: 50 }).award, false);
  assert.equal(rewardDecision({ ...base, alreadyRewarded: true }).award, false);
  assert.equal(rewardDecision({ ...base, status: "rewarded" }).award, false);
  assert.equal(rewardDecision({ ...base, enabled: false }).award, false);
});
