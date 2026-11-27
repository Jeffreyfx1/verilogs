import assert from "node:assert/strict";
import test from "node:test";
import { getSql } from "@/lib/db";
import { customerCounts, logDepositAction, recordDepositIntent, settlePaystackDeposit, type VerifiedPaystack } from "@/lib/paystack-deposit.server";
import { creditBalance } from "@/lib/shop-wallet.server";

function verified(patch: Partial<VerifiedPaystack> & Pick<VerifiedPaystack, "reference" | "metadataUserId" | "email">): VerifiedPaystack {
  return {
    status: "success",
    charged: 4000,
    currency: "NGN",
    paidAt: "2026-11-27T09:00:00.000Z",
    metadataCredit: 4000,
    productId: "",
    ...patch,
  };
}

async function seedUsers(users: { id: string; email: string; role: string; createdAt: string; deleted?: boolean }[]) {
  const sql = await getSql();
  await sql.query("insert into shop_state (id, doc) values ('main', $1) on conflict (id) do update set doc = excluded.doc", [
    JSON.stringify({ users }),
  ]);
}

test("a verified ₦4,000 deposit is credited once and a replay does not add it again", async () => {
  await seedUsers([{ id: "usr_new", email: "new@example.com", role: "customer", createdAt: "2026-11-27T08:00:00.000Z" }]);
  await recordDepositIntent({ reference: "vl_new4000", userId: "usr_new", credit: 4000, charge: 4000, productId: "" });
  const first = await settlePaystackDeposit({ verified: verified({ reference: "vl_new4000", metadataUserId: "usr_new", email: "new@example.com" }) });
  assert.equal(first.status, "credited");
  assert.equal(first.applied, true);
  assert.equal(first.balance, 4000);
  const second = await settlePaystackDeposit({ verified: verified({ reference: "vl_new4000", metadataUserId: "usr_new", email: "new@example.com" }), force: true });
  assert.equal(second.status, "credited");
  assert.equal(second.applied, false);
  assert.equal(second.balance, 4000);
  const sql = await getSql();
  const ledger = await sql.query<{ ref: string; amount: number }>("select ref, amount from shop_ledger where user_id = 'usr_new' order by ref");
  assert.deepEqual(ledger, [{ ref: "paystack:vl_new4000", amount: 4000 }]);
  const balance = await sql.query<{ balance: number }>("select balance from shop_balances where user_id = 'usr_new'");
  assert.equal(Number(balance[0]?.balance), 4000);
});

test("an existing manual ₦4,000 credit is kept and Paystack is not applied again", async () => {
  await seedUsers([{ id: "usr_ada", email: "ada@example.com", role: "customer", createdAt: "2026-10-02T00:00:00.000Z" }]);
  const sql = await getSql();
  await sql.query("insert into shop_balances (user_id, balance) values ('usr_ada', 4000) on conflict (user_id) do update set balance = 4000", []);
  await sql.query(
    "insert into shop_ledger (id, user_id, kind, amount, balance_after, note, ref, created_at) values ('led_ada', 'usr_ada', 'topup', 4000, 4000, 'Admin adjustment', 'adjust:txn_manual', '2026-11-27T10:00:00.000Z') on conflict (id) do nothing",
    [],
  );
  const linked = await settlePaystackDeposit({
    verified: verified({ reference: "vl_hist4000", metadataUserId: "", email: "ada@example.com", metadataCredit: 0 }),
  });
  assert.equal(linked.status, "credited");
  assert.equal(linked.applied, false);
  assert.equal(linked.manualRef, "adjust:txn_manual");
  assert.equal(linked.balance, 4000);
  const forced = await settlePaystackDeposit({
    verified: verified({ reference: "vl_hist4000", metadataUserId: "", email: "ada@example.com" }),
    force: true,
  });
  assert.equal(forced.applied, false);
  assert.equal(forced.balance, 4000);
  const rows = await sql.query<{ balance: number }>("select balance from shop_balances where user_id = 'usr_ada'");
  const credits = await sql.query<{ ref: string }>("select ref from shop_ledger where user_id = 'usr_ada' and ref like 'paystack:%'");
  assert.equal(Number(rows[0]?.balance), 4000);
  assert.equal(credits.length, 0);
});

test("two manual credits or a missing payment time are left for reconciliation", async () => {
  await seedUsers([{ id: "usr_two", email: "two@example.com", role: "customer", createdAt: "2026-11-01T00:00:00.000Z" }]);
  const sql = await getSql();
  await sql.query("insert into shop_balances (user_id, balance) values ('usr_two', 8000) on conflict (user_id) do update set balance = 8000", []);
  await sql.query(
    `insert into shop_ledger (id, user_id, kind, amount, balance_after, note, ref, created_at) values
      ('led_two_a', 'usr_two', 'topup', 4000, 4000, 'Admin adjustment', 'adjust:txn_a', '2026-11-27T10:00:00.000Z'),
      ('led_two_b', 'usr_two', 'topup', 4000, 8000, 'Admin adjustment', 'adjust:txn_b', '2026-11-27T11:00:00.000Z')
     on conflict (id) do nothing`,
    [],
  );
  const ambiguous = await settlePaystackDeposit({
    verified: verified({ reference: "vl_two", metadataUserId: "usr_two", email: "two@example.com" }),
  });
  assert.equal(ambiguous.status, "needs_reconciliation");
  assert.equal(ambiguous.applied, false);
  const undated = await settlePaystackDeposit({
    verified: verified({ reference: "vl_undated", metadataUserId: "usr_two", email: "two@example.com", paidAt: "" }),
  });
  assert.equal(undated.status, "needs_reconciliation");
  const kept = await settlePaystackDeposit({
    verified: verified({ reference: "vl_two", metadataUserId: "usr_two", email: "two@example.com" }),
    acceptManual: true,
  });
  assert.equal(kept.status, "credited");
  assert.equal(kept.applied, false);
  assert.equal(kept.manualRef.startsWith("adjust:txn_"), true);
  const balance = await sql.query<{ balance: number }>("select balance from shop_balances where user_id = 'usr_two'");
  assert.equal(Number(balance[0]?.balance), 8000);
});

test("a wallet credit still applies when the balance row was missing, and a repeated reference does not", async () => {
  const first = await creditBalance("usr_missing", 4000, "paystack:vl_missing", "Paystack · vl_missing", "topup");
  assert.equal(first.applied, true);
  assert.equal(first.balance, 4000);
  const second = await creditBalance("usr_missing", 4000, "paystack:vl_missing", "Paystack · vl_missing", "topup");
  assert.equal(second.applied, false);
  assert.equal(second.balance, 4000);
});

test("customer statistics come from stored accounts and reconciliation writes an audit row", async () => {
  await seedUsers([
    { id: "usr_ada", email: "Ada@Example.com", role: "customer", createdAt: "2026-10-02T00:00:00.000Z" },
    { id: "usr_ada_dup", email: "ada@example.com", role: "customer", createdAt: "2026-11-27T08:00:00.000Z" },
    { id: "usr_today", email: "today@example.com", role: "customer", createdAt: "2026-11-27T08:30:00.000Z" },
    { id: "usr_admin", email: "admin@example.com", role: "admin", createdAt: "2026-11-27T08:30:00.000Z" },
    { id: "usr_staff", email: "staff@example.com", role: "staff", createdAt: "2026-11-27T08:30:00.000Z" },
    { id: "usr_gone", email: "gone@example.com", role: "customer", createdAt: "2026-11-27T08:30:00.000Z", deleted: true },
  ]);
  const counts = await customerCounts(new Date("2026-11-27T09:31:00.000Z"));
  assert.deepEqual(counts, { total: 2, today: 1, month: 1 });
  await logDepositAction("usr_admin", "vl_hist4000", "manual credited");
  const sql = await getSql();
  const log = await sql.query<{ action: string; target: string }>("select action, target from shop_admin_log where action = 'paystack.reconcile' and target like 'vl_hist4000%'");
  assert.equal(log.length > 0, true);
  assert.equal(log[0]?.action, "paystack.reconcile");
});
