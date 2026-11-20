import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("stale imported numbers are removed and live or used rows stay", async () => {
  const db = new PGlite();
  await db.exec(`
    create table shop_products (
      id text primary key,
      category text not null,
      enabled boolean not null default false
    );
    create table shop_state (
      id text primary key,
      doc text not null,
      updated_at timestamptz not null default now()
    );
    create table shop_idempotency (
      key text primary key,
      product_id text not null default ''
    );
    create table shop_catalog (
      id text primary key,
      doc text not null,
      updated_at timestamptz not null default now()
    );
  `);
  await db.exec(`
    insert into shop_products (id, category, enabled) values
      ('live-wa', 'numbers', true),
      ('used-tg', 'numbers', false),
      ('flying', 'rent', false),
      ('stale-ig', 'numbers', false),
      ('stale-usa', 'usa', false),
      ('logs-row', 'logs', false);
    insert into shop_idempotency (key, product_id) values ('buy-1', 'flying');
  `);
  const state = {
    orders: [{ id: "ord-1", productId: "used-tg", status: "completed", amount: 500 }],
    products: [
      { id: "live-wa", category: "numbers", enabled: true },
      { id: "used-tg", category: "numbers", enabled: false },
      { id: "stale-ig", category: "numbers", enabled: false },
      { id: "logs-row", category: "logs", enabled: false },
    ],
    users: [{ id: "usr_ada", balance: 2500 }],
  };
  const catalog = [
    { id: "stale-ig", category: "numbers", enabled: false },
    { id: "logs-row", category: "logs", enabled: false },
  ];
  await db.query("insert into shop_state (id, doc) values ('main', $1)", [JSON.stringify(state)]);
  await db.query("insert into shop_catalog (id, doc) values ('main', $1)", [JSON.stringify(catalog)]);

  await db.exec(readFileSync(new URL("../../migrations/0016_clear_stale_numbers.sql", import.meta.url), "utf8"));

  const products = await db.query<{ id: string }>("select id from shop_products order by id");
  assert.deepEqual(products.rows.map((row) => row.id), ["flying", "live-wa", "logs-row", "used-tg"]);

  const saved = await db.query<{ doc: string }>("select doc from shop_state where id = 'main'");
  const doc = JSON.parse(saved.rows[0].doc) as { orders: { productId: string }[]; products: { id: string }[]; users: { balance: number }[] };
  assert.deepEqual(doc.orders.map((order) => order.productId), ["used-tg"]);
  assert.equal(doc.users[0].balance, 2500);
  assert.deepEqual(doc.products.map((product) => product.id).sort(), ["live-wa", "logs-row", "used-tg"]);

  const blobRow = await db.query<{ doc: string }>("select doc from shop_catalog where id = 'main'");
  const blob = JSON.parse(blobRow.rows[0].doc) as { id: string }[];
  assert.deepEqual(blob.map((product) => product.id), ["logs-row"]);
  await db.close();
});
