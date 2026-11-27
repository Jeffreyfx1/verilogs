import { getSql } from "@/lib/db";
import { uid } from "@/lib/money";
import { creditBalance } from "@/lib/shop-wallet.server";
import {
  decideDeposit,
  lagosWindow,
  readPaystackMeta,
  resolveDepositAccount,
  walletCreditFromCharge,
  type DepositStatus,
  type LedgerHit,
} from "@/lib/paystack-deposit";

export type VerifiedPaystack = {
  reference: string;
  status: "success" | "failed" | "pending";
  charged: number;
  currency: string;
  email: string;
  paidAt: string;
  metadataUserId: string;
  metadataCredit: number;
  productId: string;
};

export type DepositView = {
  reference: string;
  userId: string;
  email: string;
  credit: number;
  charge: number;
  status: DepositStatus;
  paystackStatus: string;
  paystackAmount: number;
  ledgerRef: string;
  manualRef: string;
  detail: string;
  productId: string;
  paidAt: string;
  updatedAt: string;
};

type DepositRow = {
  reference: string;
  user_id: string;
  credit: number;
  charge: number;
  product_id: string;
  status: string;
  paystack_status: string;
  paystack_amount: number;
  ledger_ref: string;
  manual_ref: string;
  detail: string;
  paid_at: string | Date | null;
  updated_at: string | Date | null;
};

function stamp(value: string | Date | null | undefined) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : String(value);
}

async function readAccounts() {
  const sql = await getSql();
  return sql.query<{ id: string; email: string; role: string }>(
    `select person->>'id' as id, coalesce(person->>'email', '') as email, coalesce(person->>'role', '') as role
     from shop_state, jsonb_array_elements(coalesce(doc::jsonb->'users', '[]'::jsonb)) person
     where id = 'main'`,
  );
}

export async function recordDepositIntent(input: { reference: string; userId: string; credit: number; charge: number; productId: string }) {
  const sql = await getSql();
  await sql.query(
    `insert into shop_deposits (reference, user_id, credit, charge, product_id, status, detail)
     values ($1, $2, $3, $4, $5, 'awaiting', '')
     on conflict (reference) do nothing`,
    [input.reference, input.userId, Math.round(input.credit), Math.round(input.charge), input.productId || ""],
  );
}

export async function markDepositFailed(reference: string, detail: string) {
  const sql = await getSql();
  await sql.query(
    `update shop_deposits set status = 'failed', detail = $2, updated_at = now()
     where reference = $1 and status = 'awaiting'`,
    [reference, detail.slice(0, 240)],
  );
}

async function saveDeposit(input: {
  reference: string;
  userId: string;
  credit: number;
  charge: number;
  productId: string;
  status: DepositStatus;
  paystackStatus: string;
  paystackAmount: number;
  ledgerRef: string;
  manualRef: string;
  detail: string;
  paidAt: string;
}) {
  const sql = await getSql();
  await sql.query(
    `insert into shop_deposits (
       reference, user_id, credit, charge, product_id, status, paystack_status, paystack_amount, ledger_ref, manual_ref, detail, paid_at, updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
     on conflict (reference) do update set
       user_id = case when excluded.user_id <> '' then excluded.user_id else shop_deposits.user_id end,
       credit = case when excluded.credit > 0 then excluded.credit else shop_deposits.credit end,
       charge = case when excluded.charge > 0 then excluded.charge else shop_deposits.charge end,
       product_id = case when excluded.product_id <> '' then excluded.product_id else shop_deposits.product_id end,
       status = excluded.status,
       paystack_status = excluded.paystack_status,
       paystack_amount = excluded.paystack_amount,
       ledger_ref = case when excluded.ledger_ref <> '' then excluded.ledger_ref else shop_deposits.ledger_ref end,
       manual_ref = case when excluded.manual_ref <> '' then excluded.manual_ref else shop_deposits.manual_ref end,
       detail = excluded.detail,
       paid_at = coalesce(excluded.paid_at, shop_deposits.paid_at),
       updated_at = now()
     where shop_deposits.status <> 'credited' or excluded.status = 'credited'`,
    [
      input.reference,
      input.userId,
      Math.round(input.credit),
      Math.round(input.charge),
      input.productId || "",
      input.status,
      input.paystackStatus,
      Math.round(input.paystackAmount),
      input.ledgerRef,
      input.manualRef,
      input.detail.slice(0, 240),
      input.paidAt || null,
    ],
  );
}

export async function settlePaystackDeposit(input: { verified: VerifiedPaystack; force?: boolean; acceptManual?: boolean }) {
  const verified = input.verified;
  const reference = String(verified.reference || "").trim();
  const empty = { status: "needs_reconciliation" as DepositStatus, userId: "", amount: 0, applied: false, manualRef: "", productId: "", balance: 0, error: "Missing payment reference." };
  if (!reference) return empty;
  const sql = await getSql();
  const existingRows = await sql.query<DepositRow>("select * from shop_deposits where reference = $1", [reference]);
  const existing = existingRows[0];
  if (existing?.status === "credited") {
    const balanceRows = await sql.query<{ balance: number }>("select balance from shop_balances where user_id = $1", [existing.user_id]);
    return {
      status: "credited" as DepositStatus,
      userId: existing.user_id,
      amount: Number(existing.credit) || 0,
      applied: false,
      manualRef: existing.manual_ref || "",
      productId: existing.product_id || "",
      balance: Number(balanceRows[0]?.balance) || 0,
      error: "",
    };
  }
  if (verified.status !== "success") {
    const status: DepositStatus = verified.status === "failed" ? "failed" : "awaiting";
    await saveDeposit({
      reference,
      userId: existing?.user_id || "",
      credit: Number(existing?.credit) || 0,
      charge: Number(existing?.charge) || 0,
      productId: existing?.product_id || "",
      status,
      paystackStatus: verified.status,
      paystackAmount: verified.charged,
      ledgerRef: "",
      manualRef: "",
      detail: verified.status === "failed" ? "Paystack did not confirm this payment." : "Waiting for Paystack to confirm the payment.",
      paidAt: "",
    });
    return { ...empty, status, error: verified.status === "failed" ? "Paystack has not confirmed this payment." : "Paystack has not confirmed this payment yet." };
  }
  if (verified.currency !== "NGN") {
    await saveDeposit({
      reference,
      userId: existing?.user_id || "",
      credit: Number(existing?.credit) || 0,
      charge: Number(existing?.charge) || verified.charged,
      productId: existing?.product_id || verified.productId,
      status: "needs_reconciliation",
      paystackStatus: "success",
      paystackAmount: verified.charged,
      ledgerRef: "",
      manualRef: "",
      detail: "Only a naira payment can fund the wallet.",
      paidAt: verified.paidAt,
    });
    return { ...empty, error: "Only a naira payment can fund the wallet." };
  }
  const accounts = await readAccounts();
  const resolved = resolveDepositAccount({
    metadataUserId: verified.metadataUserId,
    customerEmail: verified.email,
    storedUserId: existing?.user_id || "",
    users: accounts,
  });
  if ("error" in resolved) {
    await saveDeposit({
      reference,
      userId: existing?.user_id || "",
      credit: Number(existing?.credit) || verified.metadataCredit,
      charge: Number(existing?.charge) || verified.charged,
      productId: existing?.product_id || verified.productId,
      status: "needs_reconciliation",
      paystackStatus: "success",
      paystackAmount: verified.charged,
      ledgerRef: "",
      manualRef: "",
      detail: resolved.error,
      paidAt: verified.paidAt,
    });
    return { ...empty, error: resolved.error };
  }
  const requested = Number(existing?.credit) > 0 ? Number(existing?.credit) : verified.metadataCredit;
  const priced = walletCreditFromCharge(verified.charged, requested);
  if ("error" in priced) {
    await saveDeposit({
      reference,
      userId: resolved.userId,
      credit: requested,
      charge: verified.charged,
      productId: existing?.product_id || verified.productId,
      status: "needs_reconciliation",
      paystackStatus: "success",
      paystackAmount: verified.charged,
      ledgerRef: "",
      manualRef: "",
      detail: priced.error,
      paidAt: verified.paidAt,
    });
    return { ...empty, userId: resolved.userId, error: priced.error };
  }
  const amount = priced.amount;
  const productId = existing?.product_id || verified.productId || "";
  await saveDeposit({
    reference,
    userId: resolved.userId,
    credit: amount,
    charge: Number(existing?.charge) || verified.charged,
    productId,
    status: "pending_credit",
    paystackStatus: "success",
    paystackAmount: verified.charged,
    ledgerRef: "",
    manualRef: "",
    detail: "Paystack confirmed the payment. Wallet credit is in progress.",
    paidAt: verified.paidAt,
  });
  const ledger = await sql.query<{ ref: string; amount: number; kind: string; created_at: string | Date }>(
    "select ref, amount, kind, created_at from shop_ledger where user_id = $1 and ref <> ''",
    [resolved.userId],
  );
  const hits: LedgerHit[] = ledger.map((row) => ({ ref: row.ref, amount: Number(row.amount) || 0, kind: row.kind, createdAt: stamp(row.created_at) }));
  if (input.acceptManual) {
    const payRef = `paystack:${reference}`;
    if (hits.some((row) => row.ref === payRef)) {
      await saveDeposit({
        reference, userId: resolved.userId, credit: amount, charge: verified.charged, productId,
        status: "credited", paystackStatus: "success", paystackAmount: verified.charged,
        ledgerRef: payRef, manualRef: "", detail: "Already credited from this Paystack reference.", paidAt: verified.paidAt,
      });
      const balanceRows = await sql.query<{ balance: number }>("select balance from shop_balances where user_id = $1", [resolved.userId]);
      return { status: "credited" as DepositStatus, userId: resolved.userId, amount, applied: false, manualRef: "", productId, balance: Number(balanceRows[0]?.balance) || 0, error: "" };
    }
    const manual = hits.filter((row) => row.kind === "topup" && row.ref.startsWith("adjust:") && Math.round(row.amount) === amount);
    if (!manual.length) {
      const balanceRows = await sql.query<{ balance: number }>("select balance from shop_balances where user_id = $1", [resolved.userId]);
      await saveDeposit({
        reference, userId: resolved.userId, credit: amount, charge: verified.charged, productId,
        status: "needs_reconciliation", paystackStatus: "success", paystackAmount: verified.charged,
        ledgerRef: "", manualRef: "", detail: "No manual credit of this amount was found, so the wallet was not changed.", paidAt: verified.paidAt,
      });
      return { status: "needs_reconciliation" as DepositStatus, userId: resolved.userId, amount, applied: false, manualRef: "", productId, balance: Number(balanceRows[0]?.balance) || 0, error: "No manual credit of this amount was found, so the wallet was not changed." };
    }
    await saveDeposit({
      reference, userId: resolved.userId, credit: amount, charge: verified.charged, productId,
      status: "credited", paystackStatus: "success", paystackAmount: verified.charged,
      ledgerRef: "", manualRef: manual[0].ref, detail: "Admin confirmed the existing manual credit. Paystack was not applied again.", paidAt: verified.paidAt,
    });
    const balanceRows = await sql.query<{ balance: number }>("select balance from shop_balances where user_id = $1", [resolved.userId]);
    return { status: "credited" as DepositStatus, userId: resolved.userId, amount, applied: false, manualRef: manual[0].ref, productId, balance: Number(balanceRows[0]?.balance) || 0, error: "" };
  }
  const decision = decideDeposit({ reference, amount, paidAt: verified.paidAt, ledger: hits, force: input.force });
  if (decision.action === "reconcile") {
    await saveDeposit({
      reference, userId: resolved.userId, credit: amount, charge: verified.charged, productId,
      status: "needs_reconciliation", paystackStatus: "success", paystackAmount: verified.charged,
      ledgerRef: "", manualRef: "", detail: decision.reason, paidAt: verified.paidAt,
    });
    return { status: "needs_reconciliation" as DepositStatus, userId: resolved.userId, amount, applied: false, manualRef: "", productId, balance: 0, error: decision.reason };
  }
  if (decision.action === "link_manual" || decision.action === "already") {
    const manualRef = decision.action === "link_manual" ? decision.manualRef : "";
    const ledgerRef = decision.action === "already" ? decision.ledgerRef : "";
    const detail = decision.action === "link_manual"
      ? "Paystack confirmed this payment. The wallet already has the manual credit, so it was not added again."
      : "Already credited from this Paystack reference.";
    await saveDeposit({
      reference, userId: resolved.userId, credit: amount, charge: verified.charged, productId,
      status: "credited", paystackStatus: "success", paystackAmount: verified.charged,
      ledgerRef, manualRef, detail, paidAt: verified.paidAt,
    });
    const balanceRows = await sql.query<{ balance: number }>("select balance from shop_balances where user_id = $1", [resolved.userId]);
    return { status: "credited" as DepositStatus, userId: resolved.userId, amount, applied: false, manualRef, productId, balance: Number(balanceRows[0]?.balance) || 0, error: "" };
  }
  const moved = await creditBalance(resolved.userId, amount, `paystack:${reference}`, `Paystack · ${reference}`, "topup");
  if (!moved.applied && moved.ok) {
    await saveDeposit({
      reference, userId: resolved.userId, credit: amount, charge: verified.charged, productId,
      status: "credited", paystackStatus: "success", paystackAmount: verified.charged,
      ledgerRef: `paystack:${reference}`, manualRef: "", detail: "Already credited from this Paystack reference.", paidAt: verified.paidAt,
    });
    return { status: "credited" as DepositStatus, userId: resolved.userId, amount, applied: false, manualRef: "", productId, balance: moved.balance, error: "" };
  }
  if (!moved.ok) {
    await saveDeposit({
      reference, userId: resolved.userId, credit: amount, charge: verified.charged, productId,
      status: "needs_reconciliation", paystackStatus: "success", paystackAmount: verified.charged,
      ledgerRef: "", manualRef: "", detail: "Wallet credit did not apply. It can be retried.", paidAt: verified.paidAt,
    });
    return { status: "needs_reconciliation" as DepositStatus, userId: resolved.userId, amount, applied: false, manualRef: "", productId, balance: moved.balance, error: "Wallet credit did not apply. It can be retried." };
  }
  await saveDeposit({
    reference, userId: resolved.userId, credit: amount, charge: verified.charged, productId,
    status: "credited", paystackStatus: "success", paystackAmount: verified.charged,
    ledgerRef: `paystack:${reference}`, manualRef: "", detail: "Paystack confirmed the payment and the wallet was credited.", paidAt: verified.paidAt,
  });
  return { status: "credited" as DepositStatus, userId: resolved.userId, amount, applied: true, manualRef: "", productId, balance: moved.balance, error: "" };
}

export async function verifyPaystack(reference: string): Promise<{ ok: true; verified: VerifiedPaystack } | { ok: false; state: "pending" | "failed" | "unavailable"; message: string }> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return { ok: false, state: "unavailable", message: "Paystack is not connected yet." };
  let res: Response;
  try {
    res = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
      headers: { Authorization: `Bearer ${secret}` },
    });
  } catch {
    return { ok: false, state: "unavailable", message: "Paystack could not be reached." };
  }
  const body = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: {
      status?: string;
      currency?: string;
      amount?: number;
      paid_at?: string;
      reference?: string;
      customer?: { email?: string };
      metadata?: unknown;
    };
  } | null;
  if (!res.ok || !body) return { ok: false, state: "unavailable", message: "Paystack could not be verified." };
  const status = String(body.data?.status || "").toLowerCase();
  const meta = readPaystackMeta(body.data?.metadata);
  const charged = Math.round(Number(body.data?.amount || 0) / 100);
  const verified: VerifiedPaystack = {
    reference: String(body.data?.reference || reference),
    status: status === "success" ? "success" : status === "failed" || status === "abandoned" || status === "reversed" ? "failed" : "pending",
    charged,
    currency: String(body.data?.currency || "").toUpperCase(),
    email: String(body.data?.customer?.email || ""),
    paidAt: String(body.data?.paid_at || ""),
    metadataUserId: meta.userId,
    metadataCredit: meta.credit,
    productId: meta.productId,
  };
  if (!body.status) return { ok: false, state: "unavailable", message: body.message || "Paystack could not be verified." };
  return { ok: true, verified };
}

export async function listDeposits() {
  const sql = await getSql();
  const [rows, accounts] = await Promise.all([
    sql.query<DepositRow>("select * from shop_deposits order by updated_at desc limit 80"),
    readAccounts(),
  ]);
  return rows.map((row): DepositView => ({
    reference: row.reference,
    userId: row.user_id,
    email: accounts.find((item) => item.id === row.user_id)?.email || "",
    credit: Number(row.credit) || 0,
    charge: Number(row.charge) || 0,
    status: (row.status in { awaiting: 1, pending_credit: 1, credited: 1, failed: 1, needs_reconciliation: 1 } ? row.status : "needs_reconciliation") as DepositStatus,
    paystackStatus: row.paystack_status || "",
    paystackAmount: Number(row.paystack_amount) || 0,
    ledgerRef: row.ledger_ref || "",
    manualRef: row.manual_ref || "",
    detail: row.detail || "",
    productId: row.product_id || "",
    paidAt: stamp(row.paid_at),
    updatedAt: stamp(row.updated_at),
  }));
}

export async function customerCounts(now = new Date()) {
  const window = lagosWindow(now);
  const sql = await getSql();
  const rows = await sql.query<{ total: number; today: number; month: number }>(
    `with customers as (
       select lower(trim(person->>'email')) as email,
              min(coalesce(person->>'createdAt', '')) as created_at
       from shop_state,
            jsonb_array_elements(coalesce(doc::jsonb->'users', '[]'::jsonb)) person
       where id = 'main'
         and coalesce(person->>'role', '') = 'customer'
         and length(trim(coalesce(person->>'email', ''))) > 0
         and coalesce(person->>'deleted', '') not in ('true', '1')
       group by lower(trim(person->>'email'))
     )
     select count(*)::int as total,
            count(*) filter (where created_at >= $1)::int as today,
            count(*) filter (where created_at >= $2)::int as month
     from customers`,
    [window.today, window.month],
  );
  return {
    total: Number(rows[0]?.total) || 0,
    today: Number(rows[0]?.today) || 0,
    month: Number(rows[0]?.month) || 0,
  };
}

export async function logDepositAction(adminId: string, reference: string, detail: string) {
  const sql = await getSql();
  await sql.query(
    "insert into shop_admin_log (id, admin_id, action, target, created_at) values ($1, $2, $3, $4, $5)",
    [uid("log"), adminId, "paystack.reconcile", `${reference} ${detail}`.slice(0, 180), new Date().toISOString()],
  );
}
