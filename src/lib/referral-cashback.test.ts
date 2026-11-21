import assert from "node:assert/strict";
import test from "node:test";
import { getSql } from "@/lib/db";
import { REFERRAL_CASHBACK_NOTE } from "@/lib/referral";
import { recordReferral, settleDepositCashback, settleReferral } from "@/lib/referral.server";

const referrer = "cash-ada";

async function reset() {
  const sql = await getSql();
  await sql.query("delete from shop_ledger where user_id = $1 or user_id like 'cash-%'", [referrer]);
  await sql.query("delete from shop_referral_cashbacks where referred_id like 'cash-%'");
  await sql.query("delete from shop_referrals where referrer_id = $1 or referred_id like 'cash-%'", [referrer]);
  await sql.query("delete from shop_referral_balances where user_id = $1", [referrer]);
  await sql.query("delete from shop_balances where user_id = $1 or user_id like 'cash-%'", [referrer]);
}

async function referred(id: string, balance: number) {
  const sql = await getSql();
  await sql.query("insert into shop_balances (user_id, balance) values ($1, $2)", [id, balance]);
  await recordReferral({ referredId: id, referrerId: referrer, code: "ADA12XY" });
}

async function balance(id: string) {
  const sql = await getSql();
  const rows = await sql.query<{ balance: number }>("select balance from shop_balances where user_id = $1", [id]);
  return Number(rows[0]?.balance) || 0;
}

test("a referred user's first successful deposit pays 5% once", async () => {
  await reset();
  const sql = await getSql();
  await sql.query("insert into shop_balances (user_id, balance) values ($1, 2500)", [referrer]);
  const cases: Array<[string, number, number]> = [
    ["cash-1000", 1000, 50],
    ["cash-5000", 5000, 250],
    ["cash-10000", 10000, 500],
    ["cash-50000", 50000, 2500],
    ["cash-100000", 100000, 5000],
  ];
  for (const [id, deposit, cashback] of cases) {
    await referred(id, deposit);
    const paid = await settleDepositCashback({ userId: id, deposit, depositRef: `ref-${id}`, status: "success" });
    assert.equal(paid.awarded, true);
    assert.equal(paid.amount, cashback);
    assert.equal(await balance(id), deposit + cashback);
    const ledger = await sql.query<{ note: string; amount: number }>("select note, amount from shop_ledger where user_id = $1", [id]);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0]?.note, REFERRAL_CASHBACK_NOTE);
    assert.equal(Number(ledger[0]?.amount), cashback);
  }
  const first = "cash-1000";
  const again = await settleDepositCashback({ userId: first, deposit: 1000, depositRef: "ref-cash-1000", status: "success" });
  const later = await settleDepositCashback({ userId: first, deposit: 5000, depositRef: "ref-cash-1000-later", status: "success" });
  const raced = await Promise.all([
    settleDepositCashback({ userId: first, deposit: 1000, depositRef: "ref-cash-1000-a", status: "success" }),
    settleDepositCashback({ userId: first, deposit: 1000, depositRef: "ref-cash-1000-b", status: "success" }),
  ]);
  assert.equal(again.awarded, false);
  assert.equal(later.awarded, false);
  assert.equal(raced.every((item) => item.awarded === false), true);
  assert.equal(await balance(first), 1050);
  const rows = await sql.query<{ n: number }>("select count(*)::int as n from shop_referral_cashbacks where referred_id = $1", [first]);
  assert.equal(Number(rows[0]?.n), 1);
  const link = await sql.query<{ status: string; reward: number }>("select status, reward from shop_referrals where referred_id = $1", [first]);
  assert.equal(link[0]?.status, "pending");
  assert.equal(Number(link[0]?.reward), 100);
  assert.equal(await balance(referrer), 2500);
  const reward = await settleReferral({ buyerId: first, orderId: "ord-cash", amount: 1800, profit: 300, orderStatus: "completed" });
  assert.equal(reward.awarded, true);
  assert.equal(reward.amount, 100);
  const pot = await sql.query<{ balance: number }>("select balance from shop_referral_balances where user_id = $1", [referrer]);
  assert.equal(Number(pot[0]?.balance), 100);
  assert.equal(await balance(referrer), 2500);
  assert.equal(await balance(first), 1050);
});

test("failed, pending, and unreferred deposits do not pay cashback", async () => {
  await reset();
  const sql = await getSql();
  await sql.query("insert into shop_balances (user_id, balance) values ($1, 2500)", [referrer]);
  await referred("cash-fail", 5000);
  await referred("cash-wait", 5000);
  await sql.query("insert into shop_balances (user_id, balance) values ('cash-none', 10000)");
  assert.equal((await settleDepositCashback({ userId: "cash-fail", deposit: 5000, depositRef: "ref-fail", status: "failed" })).awarded, false);
  assert.equal((await settleDepositCashback({ userId: "cash-wait", deposit: 5000, depositRef: "ref-wait", status: "pending" })).awarded, false);
  assert.equal((await settleDepositCashback({ userId: "cash-none", deposit: 10000, depositRef: "ref-none", status: "success" })).awarded, false);
  assert.equal(await balance("cash-fail"), 5000);
  assert.equal(await balance("cash-wait"), 5000);
  assert.equal(await balance("cash-none"), 10000);
  const paid = await sql.query<{ n: number }>("select count(*)::int as n from shop_referral_cashbacks where referred_id in ('cash-fail', 'cash-wait', 'cash-none')");
  assert.equal(Number(paid[0]?.n), 0);
  assert.equal(await balance(referrer), 2500);
});
