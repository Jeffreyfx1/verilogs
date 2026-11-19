import { getSql } from "@/lib/db";
import { uid } from "@/lib/money";
import { referralSettingsOf, rewardDecision } from "@/lib/referral";
import { creditBalance } from "@/lib/shop-wallet.server";

type ReferralRow = {
  id: string;
  referrer_id: string;
  referred_id: string;
  code: string;
  status: string;
  reward: number;
  order_id: string;
  created_at: string;
  rewarded_at: string;
  note: string;
};

async function settingsFromShop() {
  const sql = await getSql();
  const rows = await sql<{ doc: string }>`select doc from shop_state where id = 'main'`;
  const settings = rows[0] ? (JSON.parse(rows[0].doc) as { settings?: { referralEnabled?: boolean; referralReward?: number; referralMinPurchase?: number } }).settings : {};
  return referralSettingsOf({
    enabled: settings?.referralEnabled,
    reward: settings?.referralReward,
    minPurchase: settings?.referralMinPurchase,
  });
}

export async function recordReferral(input: { referredId: string; referrerId: string; code: string }) {
  if (!input.referredId || !input.referrerId || input.referredId === input.referrerId) return;
  const settings = await settingsFromShop();
  if (!settings.enabled) return;
  const sql = await getSql();
  const existing = await sql<ReferralRow>`select * from shop_referrals where referred_id = ${input.referredId}`;
  if (existing[0]) return;
  await sql`insert into shop_referrals (id, referrer_id, referred_id, code, status, reward, created_at)
    values (${uid("rfr")}, ${input.referrerId}, ${input.referredId}, ${input.code}, 'pending', ${settings.reward}, ${new Date().toISOString()})
    on conflict (referred_id) do nothing`;
}

async function creditReferral(userId: string, amount: number, ref: string, note: string) {
  const sql = await getSql();
  const applied = await sql<{ balance: number }>`
    with upd as (
      insert into shop_referral_balances (user_id, balance) values (${userId}, ${amount})
      on conflict (user_id) do update set balance = shop_referral_balances.balance + ${amount}
      where not exists (select 1 from shop_referral_ledger where ref = ${ref})
      returning balance
    )
    insert into shop_referral_ledger (id, user_id, amount, ref, note, created_at)
    select ${uid("rlg")}, ${userId}, ${amount}, ${ref}, ${note}, ${new Date().toISOString()}
    from upd
    returning (select balance from upd) as balance
  `;
  return !!applied[0];
}

async function debitReferral(userId: string, amount: number, ref: string, note: string) {
  const sql = await getSql();
  const applied = await sql<{ balance: number }>`
    with upd as (
      update shop_referral_balances set balance = balance - ${amount}
      where user_id = ${userId} and balance >= ${amount}
        and not exists (select 1 from shop_referral_ledger where ref = ${ref})
      returning balance
    )
    insert into shop_referral_ledger (id, user_id, amount, ref, note, created_at)
    select ${uid("rlg")}, ${userId}, ${-amount}, ${ref}, ${note}, ${new Date().toISOString()}
    from upd
    returning (select balance from upd) as balance
  `;
  return !!applied[0];
}

export async function settleReferral(input: { buyerId: string; orderId: string; amount: number; profit: number; orderStatus: string }) {
  const sql = await getSql();
  const rows = await sql<ReferralRow>`select * from shop_referrals where referred_id = ${input.buyerId}`;
  const row = rows[0];
  if (!row) return { awarded: false };
  const settings = await settingsFromShop();
  const decision = rewardDecision({
    enabled: settings.enabled,
    reward: settings.reward,
    minPurchase: settings.minPurchase,
    status: row.status,
    orderStatus: input.orderStatus,
    orderAmount: input.amount,
    orderProfit: input.profit,
    alreadyRewarded: row.status === "rewarded",
  });
  if (!decision.award) return { awarded: false, reason: decision.reason };
  const ref = `reward:${row.referred_id}`;
  const paid = await creditReferral(row.referrer_id, decision.amount, ref, "Referral reward");
  if (!paid) return { awarded: false, reason: "Already rewarded." };
  await sql`update shop_referrals set status = 'rewarded', reward = ${decision.amount}, order_id = ${input.orderId}, rewarded_at = ${new Date().toISOString()} where id = ${row.id}`;
  return { awarded: true, amount: decision.amount };
}

export async function reverseReferral(buyerId: string, orderId: string) {
  const sql = await getSql();
  const rows = await sql<ReferralRow>`select * from shop_referrals where referred_id = ${buyerId} and status = 'rewarded'`;
  const row = rows[0];
  if (!row || (orderId && row.order_id && row.order_id !== orderId)) return { reversed: false };
  const ref = `reverse:${row.referred_id}`;
  const taken = await debitReferral(row.referrer_id, row.reward, ref, "Referral reward reversed");
  await sql`update shop_referrals set status = ${taken ? "reversed" : "flagged"}, note = ${taken ? "Reward reversed" : "Reward could not be reversed"} where id = ${row.id}`;
  return { reversed: taken };
}

export async function referralSummary(userId: string, code: string) {
  const sql = await getSql();
  const rows = await sql<ReferralRow>`select * from shop_referrals where referrer_id = ${userId} order by created_at desc limit 100`;
  const balanceRow = await sql<{ balance: number }>`select balance from shop_referral_balances where user_id = ${userId}`;
  const credited = rows.filter((row) => row.status === "rewarded").reduce((sum, row) => sum + Number(row.reward || 0), 0);
  return {
    code,
    link: `https://veri-logs.com/register?ref=${encodeURIComponent(code)}`,
    available: Number(balanceRow[0]?.balance) || 0,
    earned: credited,
    total: rows.length,
    successful: rows.filter((row) => row.status === "rewarded").length,
    pending: rows.filter((row) => row.status === "pending").length,
    history: rows.map((row) => ({
      id: row.id,
      label: `Customer ${row.referred_id.slice(-4)}`,
      createdAt: row.created_at,
      status: row.status,
      reward: Number(row.reward) || 0,
      rewardedAt: row.rewarded_at,
    })),
  };
}

export async function transferReferral(userId: string, amount: number) {
  const n = Math.round(amount);
  if (!(n > 0)) return { error: "Enter an amount.", balance: 0 };
  const ref = `transfer:${uid("xfr")}`;
  const taken = await debitReferral(userId, n, ref, "Moved to wallet");
  if (!taken) return { error: "That amount is not available.", balance: 0 };
  const credited = await creditBalance(userId, n, `referral:${ref}`, "Referral earnings", "topup");
  if (!credited.ok) {
    await creditReferral(userId, n, `undo:${ref}`, "Transfer returned");
    return { error: "The wallet did not update.", balance: 0 };
  }
  const sql = await getSql();
  const left = await sql<{ balance: number }>`select balance from shop_referral_balances where user_id = ${userId}`;
  return { error: null as string | null, balance: Number(left[0]?.balance) || 0, wallet: credited.balance };
}

export async function referralAdmin() {
  const sql = await getSql();
  const rows = await sql<ReferralRow>`select * from shop_referrals`;
  const settings = await settingsFromShop();
  const credited = rows.filter((row) => row.status === "rewarded").reduce((sum, row) => sum + Number(row.reward || 0), 0);
  const reversed = rows.filter((row) => row.status === "reversed").reduce((sum, row) => sum + Number(row.reward || 0), 0);
  return {
    settings,
    referrers: new Set(rows.map((row) => row.referrer_id)).size,
    referred: rows.length,
    successful: rows.filter((row) => row.status === "rewarded").length,
    pending: rows.filter((row) => row.status === "pending").length,
    credited,
    reversed,
    flagged: rows.filter((row) => row.status === "flagged").length,
  };
}
