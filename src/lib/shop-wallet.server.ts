import type { Data, Order } from "@/lib/catalog";
import { getSql } from "@/lib/db";
import { uid } from "@/lib/money";

export type BalanceDiff = { userId: string; email: string; sql: number; json: number };

const diffs: BalanceDiff[] = [];
const diffSeen = new Set<string>();

export function walletDiscrepancies() {
  return diffs;
}

/** shop_balances is the only balance that can be read or changed. JSON is never copied over an existing SQL row. */
export async function overlayBalances(doc: Data): Promise<Data> {
  if (!doc.users.length) return doc;
  const sql = await getSql();
  const balances = new Map<string, number>();
  for (const user of doc.users) {
    const jsonBalance = Math.round(Number(user.balance) || 0);
    const existing = await sql.query<{ balance: number }>("select balance from shop_balances where user_id = $1", [user.id]);
    if (!existing[0]) {
      await sql`insert into shop_balances (user_id, balance) values (${user.id}, ${jsonBalance}) on conflict (user_id) do nothing`;
      const seeded = await sql.query<{ balance: number }>("select balance from shop_balances where user_id = $1", [user.id]);
      balances.set(user.id, Number(seeded[0]?.balance) || 0);
      continue;
    }
    const sqlBalance = Number(existing[0].balance) || 0;
    if (sqlBalance !== jsonBalance && !diffSeen.has(user.id)) {
      diffSeen.add(user.id);
      diffs.push({ userId: user.id, email: user.email, sql: sqlBalance, json: jsonBalance });
      await sql`insert into shop_catalog_backups (id, note, products_json, product_count) values (${"wallet-diff-" + user.id}, ${"user=" + user.email + " sql=" + sqlBalance + " json=" + jsonBalance + " kept=sql"}, '[]', 0) on conflict (id) do nothing`;
      console.error(`Wallet discrepancy for ${user.email}: SQL kept, JSON differed. They were not added together.`);
    }
    balances.set(user.id, sqlBalance);
  }
  return {
    ...doc,
    users: doc.users.map((user) => (balances.has(user.id) ? { ...user, balance: balances.get(user.id) || 0 } : user)),
  };
}

async function balanceOf(userId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ balance: number }>("select balance from shop_balances where user_id = $1", [userId]);
  return Number(rows[0]?.balance) || 0;
}

export async function debitBalance(userId: string, amount: number, ref: string, note: string) {
  const amt = Math.round(amount);
  const sql = await getSql();
  if (amt <= 0 || !ref) return { ok: false, balance: await balanceOf(userId), applied: false, insufficient: false };
  const id = uid("led");
  const rows = await sql.query<{ balance_after: number }>(
    `with upd as (
       update shop_balances
       set balance = balance - $2, updated_at = now()
       where user_id = $1 and balance >= $2
         and not exists (select 1 from shop_ledger where ref = $3)
       returning balance
     )
     insert into shop_ledger (id, user_id, kind, amount, balance_after, note, ref)
     select $4, $1, 'purchase', -$2, upd.balance, $5, $3 from upd
     returning balance_after`,
    [userId, amt, ref, id, note.slice(0, 240)],
  );
  if (rows[0]) return { ok: true, balance: Number(rows[0].balance_after) || 0, applied: true, insufficient: false };
  const existing = await sql.query<{ ref: string }>("select ref from shop_ledger where ref = $1", [ref]);
  const balance = await balanceOf(userId);
  if (existing[0]) return { ok: true, balance, applied: false, insufficient: false };
  return { ok: false, balance, applied: false, insufficient: true };
}

export async function creditBalance(userId: string, amount: number, ref: string, note: string, kind: "topup" | "refund" = "topup") {
  const amt = Math.round(amount);
  const sql = await getSql();
  if (amt === 0 || !ref) return { ok: false, balance: await balanceOf(userId), applied: false };
  const id = uid("led");
  const rows = await sql.query<{ balance_after: number }>(
    `with upd as (
       update shop_balances
       set balance = balance + $2, updated_at = now()
       where user_id = $1
         and not exists (select 1 from shop_ledger where ref = $3)
       returning balance
     )
     insert into shop_ledger (id, user_id, kind, amount, balance_after, note, ref)
     select $4, $1, $6, $2, upd.balance, $5, $3 from upd
     returning balance_after`,
    [userId, amt, ref, id, note.slice(0, 240), kind],
  );
  if (rows[0]) return { ok: true, balance: Number(rows[0].balance_after) || 0, applied: true };
  return { ok: true, balance: await balanceOf(userId), applied: false };
}

export async function beginPurchaseKey(input: { key: string; userId: string; productId: string }) {
  const key = input.key.slice(0, 80);
  if (!key) return "skip" as const;
  const sql = await getSql();
  const inserted = await sql.query<{ key: string }>(
    `insert into shop_idempotency (key, user_id, product_id, status) values ($1, $2, $3, 'started')
     on conflict (key) do nothing returning key`,
    [key, input.userId, input.productId],
  );
  if (inserted[0]) return "new" as const;
  const prev = await sql.query<{ status: string }>("select status from shop_idempotency where key = $1", [key]);
  const status = prev[0]?.status || "";
  if (status === "completed") return "completed" as const;
  if (status === "failed") {
    await sql.query("update shop_idempotency set status = 'started', product_id = $2, order_id = '', provider_order_id = '', detail = '' where key = $1 and status = 'failed'", [key, input.productId]);
    return "new" as const;
  }
  return "busy" as const;
}

export async function markPurchaseKey(key: string, status: "failed" | "completed" | "needs_reconcile", patch?: { orderId?: string; providerOrderId?: string; amount?: number; detail?: string }) {
  if (!key) return;
  const sql = await getSql();
  await sql.query(
    `update shop_idempotency
     set status = $2,
         order_id = case when $3 <> '' then $3 else order_id end,
         provider_order_id = case when $4 <> '' then $4 else provider_order_id end,
         amount = case when $5 > 0 then $5 else amount end,
         detail = case when $6 <> '' then $6 else detail end
     where key = $1`,
    [key.slice(0, 80), status, patch?.orderId || "", patch?.providerOrderId || "", Math.round(patch?.amount || 0), patch?.detail || ""],
  );
}

type ReconcileDetail = {
  title?: string;
  category?: Order["category"];
  server?: string;
  network?: string;
  phone?: string;
  cost?: number;
  gain?: number;
  code?: string;
  status?: Order["status"];
  providerStatus?: string;
  refillAvailable?: boolean;
  detail?: string;
};

export async function reconcilePurchases(doc: Data): Promise<{ doc: Data; changed: boolean }> {
  const sql = await getSql();
  const rows = await sql.query<{
    key: string;
    user_id: string;
    product_id: string;
    amount: number;
    order_id: string;
    provider_order_id: string;
    detail: string;
  }>("select key, user_id, product_id, amount, order_id, provider_order_id, detail from shop_idempotency where status = 'needs_reconcile' order by created_at limit 10");
  if (!rows.length) return { doc, changed: false };
  let next = doc;
  let changed = false;
  for (const row of rows) {
    const amount = Math.round(Number(row.amount) || 0);
    if (amount <= 0) continue;
    const moved = await debitBalance(row.user_id, amount, "purchase:" + row.key, "Reconciled purchase");
    if (!moved.ok) continue;
    let detail: ReconcileDetail = {};
    try {
      detail = JSON.parse(row.detail || "{}") as ReconcileDetail;
    } catch {
      detail = {};
    }
    const orderId = row.order_id || uid("ord");
    const exists = next.orders.some((order) => order.id === orderId || (row.provider_order_id && order.providerOrderId === row.provider_order_id));
    const order: Order = {
      id: orderId,
      userId: row.user_id,
      productId: row.product_id,
      category: detail.category || "other",
      title: detail.title || "Reconciled order",
      server: detail.server || "",
      network: detail.network || "",
      amount,
      phone: detail.phone || "",
      code: detail.code || "",
      status: detail.status || "completed",
      detail: detail.detail || "Reconciled after the provider accepted the order.",
      cost: Math.round(Number(detail.cost) || 0),
      gain: Math.round(Number(detail.gain) || amount - Math.round(Number(detail.cost) || 0)),
      createdAt: new Date().toISOString(),
      providerOrderId: row.provider_order_id || "",
      providerStatus: detail.providerStatus || "",
      refillAvailable: !!detail.refillAvailable,
    };
    next = {
      ...next,
      users: next.users.map((user) => (user.id === row.user_id ? { ...user, balance: moved.balance } : user)),
      orders: exists ? next.orders : [order, ...next.orders],
      txns: exists ? next.txns : [{ id: uid("txn"), userId: row.user_id, kind: "purchase" as const, amount: -amount, note: order.title, createdAt: order.createdAt }, ...next.txns],
    };
    await markPurchaseKey(row.key, "completed", { orderId, providerOrderId: row.provider_order_id, amount });
    changed = true;
  }
  return { doc: next, changed };
}
