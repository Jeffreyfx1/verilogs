import assert from "node:assert/strict";
import test from "node:test";
import {
  countCustomers,
  decideDeposit,
  lagosStart,
  lagosWindow,
  readPaystackMeta,
  readWebhookEvent,
  resolveDepositAccount,
  shouldAckWebhook,
  walletCreditFromCharge,
} from "./paystack-deposit.ts";

const paid = "2026-11-27T09:00:00.000Z";

test("metadata is read from an object, a JSON string, and custom fields", () => {
  assert.deepEqual(readPaystackMeta({ userId: "usr_ada", credit: 4000, productId: "p1" }), {
    userId: "usr_ada",
    credit: 4000,
    productId: "p1",
  });
  assert.deepEqual(readPaystackMeta('{"userId":"usr_ada","credit":"4000"}'), {
    userId: "usr_ada",
    credit: 4000,
    productId: "",
  });
  assert.equal(readPaystackMeta({ custom_fields: [{ variable_name: "userId", value: "usr_ada" }, { variable_name: "credit", value: "4000" }] }).userId, "usr_ada");
  assert.equal(readPaystackMeta("not-json").userId, "");
  assert.equal(readWebhookEvent('{"event":"charge.success","data":{"reference":"vl_abc"}}')?.reference, "vl_abc");
  assert.equal(readWebhookEvent("{"), null);
});

test("wallet credit cannot exceed the verified naira charge", () => {
  assert.deepEqual(walletCreditFromCharge(4000, 4000), { amount: 4000 });
  assert.deepEqual(walletCreditFromCharge(4100, 4000), { amount: 4000 });
  assert.deepEqual(walletCreditFromCharge(4000, 0), { amount: 4000 });
  assert.equal("error" in walletCreditFromCharge(4000, 5000), true);
  assert.equal("error" in walletCreditFromCharge(50, 0), true);
});

test("the account comes from the stored deposit, then metadata, then one matching email", () => {
  const users = [
    { id: "usr_ada", email: "Ada@Example.com", role: "customer" },
    { id: "usr_admin", email: "admin@example.com", role: "admin" },
  ];
  assert.deepEqual(resolveDepositAccount({ metadataUserId: "usr_other", customerEmail: "ada@example.com", storedUserId: "usr_ada", users }), { error: "Stored account and Paystack metadata do not match." });
  assert.deepEqual(resolveDepositAccount({ metadataUserId: "usr_ada", customerEmail: "ada@example.com", storedUserId: "", users }), { userId: "usr_ada" });
  assert.deepEqual(resolveDepositAccount({ metadataUserId: "usr_ada", customerEmail: "other@example.com", storedUserId: "", users }), { error: "Paystack email does not match the account on this payment." });
  assert.deepEqual(resolveDepositAccount({ metadataUserId: "", customerEmail: "ada@example.com", storedUserId: "", users }), { userId: "usr_ada" });
  assert.equal("error" in resolveDepositAccount({ metadataUserId: "", customerEmail: "missing@example.com", storedUserId: "", users }), true);
});

test("one manual ₦4,000 credit is linked and is not credited again", () => {
  const ledger = [{ ref: "adjust:txn_manual", amount: 4000, kind: "topup", createdAt: "2026-11-27T10:00:00.000Z" }];
  const once = decideDeposit({ reference: "vl_hist", amount: 4000, paidAt: paid, ledger });
  assert.deepEqual(once, { action: "link_manual", manualRef: "adjust:txn_manual" });
  const twice = decideDeposit({
    reference: "vl_hist",
    amount: 4000,
    paidAt: paid,
    ledger: [...ledger, { ref: "adjust:txn_again", amount: 4000, kind: "topup", createdAt: "2026-11-27T11:00:00.000Z" }],
  });
  assert.equal(twice.action, "reconcile");
  const paystack = decideDeposit({
    reference: "vl_hist",
    amount: 4000,
    paidAt: paid,
    ledger: [{ ref: "paystack:vl_hist", amount: 4000, kind: "topup", createdAt: paid }],
    force: true,
  });
  assert.deepEqual(paystack, { action: "already", ledgerRef: "paystack:vl_hist" });
  const missingTime = decideDeposit({ reference: "vl_hist", amount: 4000, paidAt: "", ledger });
  assert.equal(missingTime.action, "reconcile");
  const different = decideDeposit({
    reference: "vl_hist",
    amount: 4000,
    paidAt: paid,
    ledger: [{ ref: "adjust:txn_other", amount: 3500, kind: "topup", createdAt: "2026-11-27T10:00:00.000Z" }],
  });
  assert.equal(different.action, "reconcile");
  const fresh = decideDeposit({ reference: "vl_new", amount: 4000, paidAt: paid, ledger: [] });
  assert.deepEqual(fresh, { action: "credit" });
});

test("a successful charge is not acknowledged until it is recorded", () => {
  assert.equal(shouldAckWebhook({ signatureOk: false, event: "charge.success", reference: "vl_1", verify: "success", recorded: true }), false);
  assert.equal(shouldAckWebhook({ signatureOk: true, event: "charge.success", reference: "vl_1", verify: "success", recorded: false }), false);
  assert.equal(shouldAckWebhook({ signatureOk: true, event: "charge.success", reference: "vl_1", verify: "success", recorded: true }), true);
  assert.equal(shouldAckWebhook({ signatureOk: true, event: "charge.success", reference: "vl_1", verify: "unavailable", recorded: false }), false);
  assert.equal(shouldAckWebhook({ signatureOk: true, event: "charge.success", reference: "vl_1", verify: "pending", recorded: true }), false);
  assert.equal(shouldAckWebhook({ signatureOk: true, event: "charge.success", reference: "", verify: "failed", recorded: true }), false);
  assert.equal(shouldAckWebhook({ signatureOk: true, event: "transfer.success", reference: "", verify: "pending", recorded: false }), true);
});

test("customer counts use Africa/Lagos and ignore admins, staff, duplicates and deleted accounts", () => {
  const now = new Date("2026-11-27T09:31:00.000Z");
  const window = lagosWindow(now);
  assert.equal(lagosStart(now, "day"), "2026-11-26T23:00:00.000Z");
  assert.equal(lagosStart(now, "month"), "2026-10-31T23:00:00.000Z");
  assert.equal(window.today, "2026-11-26T23:00:00.000Z");
  const counts = countCustomers([
    { email: "Ada@Example.com", role: "customer", createdAt: "2026-11-27T08:00:00.000Z" },
    { email: "ada@example.com", role: "customer", createdAt: "2026-11-01T00:00:00.000Z" },
    { email: "old@example.com", role: "customer", createdAt: "2026-10-01T00:00:00.000Z" },
    { email: "admin@example.com", role: "admin", createdAt: "2026-11-27T08:00:00.000Z" },
    { email: "staff@example.com", role: "staff", createdAt: "2026-11-27T08:00:00.000Z" },
    { email: "gone@example.com", role: "customer", createdAt: "2026-11-27T08:00:00.000Z", deleted: true },
    { email: "  ", role: "customer", createdAt: "2026-11-27T08:00:00.000Z" },
  ], now);
  assert.deepEqual(counts, { total: 2, today: 0, month: 1 });
});
