import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("number catalogue reset removes server rows and leaves GetaText and other catalogues", async () => {
  const db = new PGlite();
  await db.exec(`
    create table shop_products (
      id text primary key,
      provider_id text not null default '',
      category text not null,
      import_type text not null default '',
      server_id text not null default '',
      enabled boolean not null default false,
      name text not null default ''
    );
    create table shop_state (
      id text primary key,
      doc text not null,
      updated_at timestamptz not null default now()
    );
    create table shop_catalog (
      id text primary key,
      doc text not null,
      updated_at timestamptz not null default now()
    );
    create table shop_catalog_backups (
      id text primary key,
      note text not null default '',
      products_json text not null,
      product_count integer not null default 0
    );
    create table shop_import_jobs (
      id text primary key,
      provider_id text not null default '',
      meta text not null default '{}'
    );
    create table shop_import_batches (
      job_id text not null,
      seq integer not null,
      items text not null
    );
    create table provider_keys (
      provider_id text primary key,
      api_key text not null
    );
  `);
  await db.exec(`
    insert into shop_products (id, provider_id, category, import_type, server_id, enabled, name) values
      ('live-1', 'srv1', 'numbers', 'NUMBER_IMPORT', '1', true, 'WhatsApp'),
      ('used-1', 'srv1', 'numbers', '', '', false, 'Telegram'),
      ('rent-1', 'srv2', 'rent', 'NUMBER_IMPORT', '2', true, 'Rent'),
      ('srv3', 'srv3', 'number', 'NUMBER_IMPORT', '3', false, 'Server 3'),
      ('usa-1', 'geta', 'usa', 'USA_IMPORT', 'usa', true, 'GetaText USA'),
      ('usa-old', 'geta', 'numbers', '', '', true, 'Old GetaText shape'),
      ('logs-1', 'logs', 'logs', 'RANDOM_IMPORT', '', true, 'Logs'),
      ('smm-1', 'smm', 'smm', 'SMM_IMPORT', '', true, 'SMM'),
      ('vpn-1', 'vpn', 'vpn', 'VPN_IMPORT', '', false, 'VPN');
    insert into shop_import_jobs (id, provider_id, meta) values
      ('job-num', 'srv1', '{"kind":"numbers"}'),
      ('job-usa', 'geta', '{"kind":"usa"}');
    insert into shop_import_batches (job_id, seq, items) values
      ('job-num', 0, '[{"id":"live-1"}]'),
      ('job-usa', 0, '[{"id":"usa-1"}]');
    insert into provider_keys (provider_id, api_key) values
      ('srv1', 'number-key'),
      ('geta', 'getatext-key');
  `);
  const state = {
    orders: [{ id: "ord-1", productId: "used-1", status: "waiting", amount: 500 }],
    users: [{ id: "usr_ada", balance: 2500 }],
    txns: [{ id: "txn-1", amount: 2500 }],
    providers: [
      { id: "srv1", name: "5sim", baseUrl: "https://5sim.net/v1", importType: "NUMBER_IMPORT", serverId: "1", enabled: true, servesNumbers: true, lastSync: { imported: 100 } },
      { id: "srv2", name: "Server 2", baseUrl: "https://server2.example/api", importType: "NUMBER_IMPORT", serverId: "2", enabled: true, lastSync: { imported: 40 } },
      { id: "srv3", name: "Server 3", baseUrl: "https://server3.example/api", importType: "NUMBER_IMPORT", serverId: "3", enabled: true, lastSync: { imported: 20 } },
      { id: "geta", name: "GetaText", baseUrl: "https://getatext.com/api/v1/prices-info", importType: "USA_IMPORT", serverId: "usa", enabled: true, lastSync: { imported: 12 } },
      { id: "logs", name: "Logs", baseUrl: "https://logs.example", importType: "RANDOM_IMPORT", serverId: "", enabled: true, lastSync: { imported: 8 } },
    ],
    products: [
      { id: "live-1", providerId: "srv1", category: "numbers", importType: "NUMBER_IMPORT", serverId: "1" },
      { id: "usa-1", providerId: "geta", category: "usa", importType: "USA_IMPORT", serverId: "usa" },
      { id: "logs-1", providerId: "logs", category: "logs" },
    ],
  };
  await db.query("insert into shop_state (id, doc) values ('main', $1)", [JSON.stringify(state)]);
  await db.query("insert into shop_catalog (id, doc) values ('main', $1)", [JSON.stringify([
    { id: "live-1", category: "numbers" },
    { id: "usa-1", category: "usa" },
    { id: "logs-1", category: "logs" },
  ])]);

  await db.exec(readFileSync(new URL("../../migrations/0016_clear_stale_numbers.sql", import.meta.url), "utf8"));

  const products = await db.query<{ id: string }>("select id from shop_products order by id");
  assert.deepEqual(products.rows.map((row) => row.id), ["logs-1", "smm-1", "usa-1", "usa-old", "vpn-1"]);

  const saved = await db.query<{ doc: string }>("select doc from shop_state where id = 'main'");
  const doc = JSON.parse(saved.rows[0].doc) as {
    orders: { productId: string }[];
    users: { balance: number }[];
    txns: { amount: number }[];
    products: { id: string }[];
    providers: { id: string; baseUrl: string; enabled: boolean; lastSync: { imported: number } | null; serverId?: string }[];
  };
  assert.deepEqual(doc.orders.map((order) => order.productId), ["used-1"]);
  assert.equal(doc.users[0].balance, 2500);
  assert.equal(doc.txns[0].amount, 2500);
  assert.deepEqual(doc.products.map((product) => product.id).sort(), ["logs-1", "usa-1"]);
  const servers = Object.fromEntries(doc.providers.map((provider) => [provider.id, provider]));
  assert.equal(servers.srv1.enabled, true);
  assert.equal(servers.srv1.baseUrl, "https://5sim.net/v1");
  assert.equal(servers.srv1.lastSync, null);
  assert.equal(servers.srv2.lastSync, null);
  assert.equal(servers.srv3.lastSync, null);
  assert.equal(servers.geta.lastSync?.imported, 12);
  assert.equal(servers.geta.baseUrl, "https://getatext.com/api/v1/prices-info");
  assert.equal(servers.logs.lastSync?.imported, 8);

  const catalog = await db.query<{ doc: string }>("select doc from shop_catalog where id = 'main'");
  assert.deepEqual((JSON.parse(catalog.rows[0].doc) as { id: string }[]).map((row) => row.id).sort(), ["logs-1", "usa-1"]);

  const jobs = await db.query<{ id: string }>("select id from shop_import_jobs order by id");
  assert.deepEqual(jobs.rows.map((row) => row.id), ["job-usa"]);
  const batches = await db.query<{ job_id: string }>("select job_id from shop_import_batches");
  assert.deepEqual(batches.rows.map((row) => row.job_id), ["job-usa"]);

  const keys = await db.query<{ provider_id: string; api_key: string }>("select provider_id, api_key from provider_keys order by provider_id");
  assert.deepEqual(keys.rows, [
    { provider_id: "geta", api_key: "getatext-key" },
    { provider_id: "srv1", api_key: "number-key" },
  ]);

  const backup = await db.query<{ product_count: number }>("select product_count from shop_catalog_backups where id = 'number-catalogue-reset'");
  assert.equal(Number(backup.rows[0].product_count), 4);
  await db.close();
});
