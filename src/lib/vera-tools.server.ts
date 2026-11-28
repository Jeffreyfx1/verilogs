/** Read-only lookups for Vera. The signed-in role is passed in by the server. The model cannot change it. */

import { getSql } from "@/lib/db";
import { customerCounts } from "@/lib/paystack-deposit.server";

export type VeraRole = "guest" | "customer" | "admin";

const ADMIN_ONLY = new Set(["admin_overview"]);
const ACCOUNT_ONLY = new Set(["account_snapshot", "my_orders", "order_status", "my_deposits"]);

export function veraToolAllowed(name: string, role: VeraRole) {
  if (ADMIN_ONLY.has(name)) return role === "admin";
  if (ACCOUNT_ONLY.has(name)) return role === "customer" || role === "admin";
  return name === "search_catalogue";
}

export const VERA_TOOL_DEFS = [
  {
    type: "function",
    function: {
      name: "account_snapshot",
      description: "Wallet balance and recent wallet transactions for the signed-in customer. Read only.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "my_orders",
      description: "Recent purchases for the signed-in customer. Read only. Does not include other people.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "order_status",
      description: "One order for the signed-in customer, or the latest order when latest is true. Read only.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string" },
          latest: { type: "boolean" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "my_deposits",
      description: "Paystack deposit records for the signed-in customer, including credits that still need reconciliation. Read only.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_catalogue",
      description: "Search current Verilogs stock and prices. area is numbers, usa, rent, logs, data, vpn, airtime, or any.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          area: { type: "string" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "admin_overview",
      description: "Shop totals for an authenticated administrator: customers, orders, today's revenue and profit, deposits, and thin stock. Read only.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
] as const;

type Actor = { id: string; role: VeraRole };
export type VeraShop = { balance: number; name: string; orders: Record<string, unknown>[]; txns: Record<string, unknown>[] };

import { lagosWindow } from "@/lib/paystack-deposit";

function cleanArgs(raw: unknown) {
  if (!raw || typeof raw !== "object") return {} as Record<string, unknown>;
  return raw as Record<string, unknown>;
}

export async function runVeraTool(name: string, rawArgs: unknown, actor: Actor | null, shop?: VeraShop): Promise<string> {
  const role = actor?.role || "guest";
  if (!veraToolAllowed(name, role)) return JSON.stringify({ error: "Not available on this account." });
  try {
    const args = cleanArgs(rawArgs);
    if (name === "account_snapshot") return JSON.stringify(await accountSnapshot(actor!, shop));
    if (name === "my_orders") return JSON.stringify(await myOrders(actor!, shop));
    if (name === "order_status") return JSON.stringify(await orderStatus(actor!, args, shop));
    if (name === "my_deposits") return JSON.stringify(await myDeposits(actor!));
    if (name === "search_catalogue") return JSON.stringify(await searchCatalogue(String(args.query || ""), String(args.area || "any")));
    if (name === "admin_overview") return JSON.stringify(await adminOverview());
    return JSON.stringify({ error: "Unknown lookup." });
  } catch {
    return JSON.stringify({ error: "That lookup failed. Try again in a moment." });
  }
}

async function people() {
  const sql = await getSql();
  const rows = await sql.query<{ doc: unknown }>("select doc from shop_state where id = 'main'");
  let doc: { users?: unknown[]; txns?: unknown[]; orders?: unknown[] } = {};
  const raw = rows[0]?.doc;
  if (typeof raw === "string") {
    try {
      doc = JSON.parse(raw) as typeof doc;
    } catch {
      doc = {};
    }
  } else if (raw && typeof raw === "object") doc = raw as typeof doc;
  return {
    users: Array.isArray(doc.users) ? doc.users as Record<string, unknown>[] : [],
    txns: Array.isArray(doc.txns) ? doc.txns as Record<string, unknown>[] : [],
    orders: Array.isArray(doc.orders) ? doc.orders as Record<string, unknown>[] : [],
  };
}

function safeOrder(order: Record<string, unknown>) {
  const category = String(order.category || "");
  const numberLike = category === "numbers" || category === "number" || category === "usa" || category === "rent";
  const code = numberLike ? String(order.code || "").slice(0, 12) : "";
  return {
    id: String(order.id || ""),
    title: String(order.title || "").slice(0, 140),
    category,
    status: String(order.status || ""),
    providerStatus: String(order.providerStatus || "").slice(0, 80),
    amount: Number(order.amount) || 0,
    createdAt: String(order.createdAt || ""),
    server: String(order.server || "").slice(0, 40),
    phone: numberLike ? String(order.phone || "").slice(0, 20) : "",
    code,
  };
}

async function accountSnapshot(actor: Actor, shop?: VeraShop) {
  if (shop) {
    const recent = shop.txns
      .filter((txn) => String(txn.userId || "") === actor.id)
      .slice(0, 6)
      .map((txn) => ({
        kind: String(txn.kind || ""),
        amount: Number(txn.amount) || 0,
        note: String(txn.note || "").slice(0, 120),
        createdAt: String(txn.createdAt || ""),
      }));
    return { balance: shop.balance, name: shop.name.slice(0, 80), recent };
  }
  const { users, txns } = await people();
  const user = users.find((item) => String(item.id || "") === actor.id);
  if (!user) return { error: "Sign in again to see this account." };
  const recent = txns
    .filter((txn) => String(txn.userId || "") === actor.id)
    .slice(0, 6)
    .map((txn) => ({
      kind: String(txn.kind || ""),
      amount: Number(txn.amount) || 0,
      note: String(txn.note || "").slice(0, 120),
      createdAt: String(txn.createdAt || ""),
    }));
  return { balance: Number(user.balance) || 0, name: String(user.name || "").slice(0, 80), recent };
}

async function myOrders(actor: Actor, shop?: VeraShop) {
  const orders = shop ? shop.orders : (await people()).orders;
  return { orders: ownedOrders(actor, orders).slice(0, 6).map(safeOrder) };
}

async function orderStatus(actor: Actor, args: Record<string, unknown>, shop?: VeraShop) {
  const orders = shop ? shop.orders : (await people()).orders;
  const owned = ownedOrders(actor, orders);
  const id = String(args.orderId || "").trim();
  const picked = id ? owned.find((order) => String(order.id || "") === id) : owned[0];
  if (!picked) return { error: "No matching order on this account." };
  return { order: safeOrder(picked) };
}

function ownedOrders(actor: Actor, orders: Record<string, unknown>[]) {
  return orders
    .filter((order) => String(order.userId || "") === actor.id)
    .slice()
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function myDeposits(actor: Actor) {
  const sql = await getSql();
  const rows = await sql.query<{ reference: string; credit: number; status: string; paystack_status: string; paid_at: string | null; updated_at: string | null }>(
    "select reference, credit, status, paystack_status, paid_at, updated_at from shop_deposits where user_id = $1 order by updated_at desc limit 6",
    [actor.id],
  );
  return {
    deposits: rows.map((row) => ({
      reference: row.reference,
      credit: Number(row.credit) || 0,
      status: row.status,
      paystackStatus: row.paystack_status || "",
      paidAt: row.paid_at || "",
      updatedAt: row.updated_at || "",
    })),
  };
}

const AREAS: Record<string, string[]> = {
  numbers: ["number", "numbers"],
  usa: ["usa"],
  rent: ["rent"],
  logs: ["logs"],
  data: ["data"],
  vpn: ["vpn"],
};

async function searchCatalogue(query: string, area: string) {
  const q = query.trim().slice(0, 80);
  const sql = await getSql();
  const aliases: Record<string, string> = { number: "numbers", sms: "numbers", marketplace: "logs" };
  const shelf = aliases[area.trim().toLowerCase()] || area.trim().toLowerCase();
  if (shelf === "airtime" || /\bairtime\b/i.test(q)) {
    const rows = await sql.query<{ name: string; brand: string; enabled: boolean; min_amount: number; max_amount: number }>(
      `select name, brand, enabled, min_amount, max_amount from shop_airtime_networks
       where ($1 = '' or lower(name) like $2 or lower(brand) like $2)
       order by enabled desc, name asc limit 8`,
      [q.toLowerCase(), `%${q.toLowerCase().replace(/[%_\\]/g, "")}%`],
    );
    return {
      area: "airtime",
      note: "Airtime purchases are not open. These are the saved networks only.",
      items: rows.map((row) => ({ name: row.name, brand: row.brand, enabled: !!row.enabled, minAmount: Number(row.min_amount) || 0, maxAmount: Number(row.max_amount) || 0 })),
    };
  }
  const categories = (AREAS[shelf] || []).join(",");
  const needle = `%${q.toLowerCase().replace(/[%_\\]/g, "")}%`;
  const rows = await sql.query<{ name: string; service: string; category: string; country: string; price: number; stock: number; server_id: string }>(
    `select name, service, category, country, price, stock, server_id
     from shop_products
     where enabled = true and stock > 0
       and ($1 = '' or category = any(string_to_array($1, ',')))
       and ($2 = '' or lower(name) like $3 or lower(service) like $3 or lower(country) like $3)
     order by price asc
     limit 8`,
    [categories, q.toLowerCase(), needle],
  );
  return {
    area: shelf || "any",
    items: rows.map((row) => ({
      name: row.name,
      service: row.service,
      category: row.category,
      country: row.country,
      price: Number(row.price) || 0,
      stock: Number(row.stock) || 0,
      server: row.server_id || "",
    })),
  };
}

async function adminOverview() {
  const today = lagosWindow().today;
  const sql = await getSql();
  const [customers, orders, top, deposits, thin] = await Promise.all([
    customerCounts(),
    sql.query<{ completed: number; revenue_today: string; profit_today: string }>(
      `select
         count(*) filter (where o->>'status' = 'completed')::int as completed,
         coalesce(sum(case
           when o->>'status' = 'completed' and coalesce(o->>'createdAt','') >= $1 and (o->>'amount') ~ '^-?[0-9]+(\\.[0-9]+)?$'
           then (o->>'amount')::numeric else 0 end), 0)::text as revenue_today,
         coalesce(sum(case
           when o->>'status' = 'completed' and coalesce(o->>'createdAt','') >= $1 and (o->>'gain') ~ '^-?[0-9]+(\\.[0-9]+)?$'
           then (o->>'gain')::numeric else 0 end), 0)::text as profit_today
       from shop_state, jsonb_array_elements(coalesce(doc::jsonb->'orders', '[]'::jsonb)) o
       where id = 'main'`,
      [today],
    ),
    sql.query<{ title: string; n: number }>(
      `select o->>'title' as title, count(*)::int as n
       from shop_state, jsonb_array_elements(coalesce(doc::jsonb->'orders', '[]'::jsonb)) o
       where id = 'main' and coalesce(o->>'title','') <> ''
       group by 1
       order by n desc
       limit 1`,
    ),
    sql.query<{ credited_today: number; investigate: number }>(
      `select
         count(*) filter (where status = 'credited' and updated_at >= $1::timestamptz)::int as credited_today,
         count(*) filter (where status = 'needs_reconciliation')::int as investigate
       from shop_deposits`,
      [today],
    ),
    sql.query<{ category: string; n: number }>(
      "select category, count(*)::int as n from shop_products where enabled = false or stock <= 0 group by category order by n desc limit 6",
    ),
  ]);
  const row = orders[0];
  const best = top[0];
  return {
    customers,
    completedOrders: Number(row?.completed) || 0,
    revenueToday: Number(row?.revenue_today) || 0,
    profitToday: Number(row?.profit_today) || 0,
    highestVolume: best?.title ? { title: best.title, orders: Number(best.n) || 0 } : null,
    depositsCreditedToday: Number(deposits[0]?.credited_today) || 0,
    depositsNeedingReconciliation: Number(deposits[0]?.investigate) || 0,
    unavailableByCategory: thin.map((item) => ({ category: item.category, count: Number(item.n) || 0 })),
  };
}
