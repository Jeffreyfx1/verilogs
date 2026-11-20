import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { describeTarget, isTransientConnectionError, poolConfig } from "./pg-config.mjs";

test("external Render hosts use SSL and internal hosts stay plaintext", () => {
  const external = poolConfig("postgres://user:secret@dpg-abc.frankfurt-postgres.render.com/verilogs");
  assert.deepEqual(external.ssl, { rejectUnauthorized: false });
  assert.equal(external.connectionTimeoutMillis, 15_000);
  assert.equal(describeTarget(external.connectionString).includes("secret"), false);
  assert.match(describeTarget(external.connectionString), /dpg-abc.frankfurt-postgres.render.com ssl=require/);

  const internal = poolConfig("postgres://user:secret@dpg-abc-a/verilogs");
  assert.equal(internal.ssl, false);
  assert.match(describeTarget(internal.connectionString), /ssl=off/);

  const local = poolConfig("postgres://user:secret@localhost:5432/verilogs");
  assert.equal(local.ssl, false);
});

test("an explicit sslmode is not overridden", () => {
  const disabled = poolConfig("postgres://user:secret@dpg-abc.frankfurt-postgres.render.com/verilogs?sslmode=disable");
  assert.equal(disabled.ssl, false);
  const required = poolConfig("postgres://user:secret@localhost/verilogs?sslmode=require");
  assert.equal(required.ssl, undefined);
});

test("deploy migrations do not delete catalogue or customer data", () => {
  for (const name of ["0016_clear_stale_numbers.sql", "0017_reset_number_catalogue.sql"]) {
    const text = readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
    assert.equal(/\b(delete|drop|truncate|update)\b/i.test(text), false, name);
  }
});
test("SQL failures are not retried and dropped sockets are", () => {
  assert.equal(isTransientConnectionError(new Error("Connection terminated unexpectedly")), true);
  assert.equal(isTransientConnectionError(Object.assign(new Error("syntax error"), { code: "42601" })), false);
});

