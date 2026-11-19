/** Referral rules that do not touch the database. */

export type ReferralSettings = {
  enabled: boolean;
  reward: number;
  minPurchase: number;
};

export function referralSettingsOf(input: Partial<ReferralSettings> | null | undefined): ReferralSettings {
  const reward = Number(input?.reward);
  const minPurchase = Number(input?.minPurchase);
  return {
    enabled: input?.enabled !== false,
    reward: Number.isFinite(reward) && reward >= 0 ? Math.round(reward) : 100,
    minPurchase: Number.isFinite(minPurchase) && minPurchase >= 0 ? Math.round(minPurchase) : 0,
  };
}

export function makeReferralCode(name: string, taken: Set<string>, salt: string) {
  const base = (name || "VL").replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase() || "VL";
  const body = salt.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase() || "USER";
  let code = (base + body).slice(0, 12);
  let n = 2;
  while (taken.has(code)) {
    code = (base + body + n).slice(0, 12);
    n += 1;
  }
  return code;
}

export type RewardDecision =
  | { award: false; reason: string }
  | { award: true; amount: number };

export function rewardDecision(input: {
  enabled: boolean;
  reward: number;
  minPurchase: number;
  status: string;
  orderStatus: string;
  orderAmount: number;
  orderProfit: number;
  alreadyRewarded: boolean;
}): RewardDecision {
  if (!input.enabled) return { award: false, reason: "Programme is off." };
  if (input.alreadyRewarded || input.status === "rewarded") return { award: false, reason: "Already rewarded." };
  if (input.status !== "pending") return { award: false, reason: "Not a pending referral." };
  if (input.orderStatus !== "completed") return { award: false, reason: "Purchase is not completed." };
  if (!(input.orderAmount >= input.minPurchase)) return { award: false, reason: "Below the minimum purchase." };
  if (!(input.orderProfit >= input.reward)) return { award: false, reason: "Profit does not cover the reward." };
  if (!(input.reward > 0)) return { award: false, reason: "Reward is zero." };
  return { award: true, amount: input.reward };
}
