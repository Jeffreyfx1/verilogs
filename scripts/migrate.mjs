#!/usr/bin/env node
/**
 * Deploy-time database migrator (node-postgres, `pg`).
 *
 * On Render this runs as the pre-deploy command, after the build and before
 * the new instance goes live. Each file is applied in one transaction and
 * recorded in `_migrations`, so a completed file is never applied again.
 *
 * The read is non-recursive, so the opt-in auth schema under migrations/auth/
 * is not applied to an app that never asked for sign-in.
 *
 * No DATABASE_URL (local / preview builds) -> skip; the PGLite fallback applies
 * the same files at startup instead (see src/lib/db.ts).
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { pendingMigrations } from "./migration-plan.mjs";
import { describeTarget, isTransientConnectionError, poolConfig } from "./pg-config.mjs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log(
    "[migrate] DATABASE_URL not set — skipping (the PGLite fallback migrates itself).",
  );
  process.exit(0);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const RETRY_DELAYS = [1000, 2000, 4000];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function applyPending(client) {
  await client.query(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
  );
  const applied = (await client.query("SELECT name FROM _migrations")).rows.map((row) => row.name);
  const entries = await readdir(migrationsDir);
  let count = 0;
  for (const { name } of pendingMigrations(entries, applied)) {
    const text = await readFile(join(migrationsDir, name), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(text);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
    } catch (err) {
      console.error(`[migrate] error applying ${name}`);
      try {
        await client.query("ROLLBACK");
      } catch {
        // ROLLBACK fails when the connection died — keep the original error.
      }
      throw err;
    }
    console.log(`[migrate] applied ${name}`);
    count += 1;
  }
  console.log(count ? `[migrate] done — ${count} migration(s) applied.` : "[migrate] up to date.");
}

async function connectAndMigrate() {
  const pool = new pg.Pool(poolConfig(databaseUrl, { max: 1, applicationName: "verilogs-migrate" }));
  pool.on("error", (err) => {
    console.error("[migrate] idle connection error:", err.message);
  });
  let client;
  try {
    client = await pool.connect();
    client.on("error", (err) => {
      console.error("[migrate] connection error:", err.message);
    });
    await applyPending(client);
  } finally {
    try {
      client?.release();
    } catch {
      // The socket is already gone.
    }
    await pool.end().catch(() => undefined);
  }
}

async function main() {
  let entries;
  try {
    entries = await readdir(migrationsDir);
  } catch {
    console.log("[migrate] no migrations/ directory — nothing to do.");
    return;
  }
  if (pendingMigrations(entries, []).length === 0) {
    console.log("[migrate] no migrations — nothing to do.");
    return;
  }

  console.log(`[migrate] connecting to ${describeTarget(databaseUrl)}`);
  let lastError;
  for (let attempt = 1; attempt <= RETRY_DELAYS.length + 1; attempt += 1) {
    try {
      await connectAndMigrate();
      return;
    } catch (err) {
      lastError = err;
      const again = attempt <= RETRY_DELAYS.length && isTransientConnectionError(err);
      if (!again) break;
      const wait = RETRY_DELAYS[attempt - 1];
      console.error(`[migrate] attempt ${attempt} failed: ${err?.message || err}. Retrying in ${wait}ms.`);
      await sleep(wait);
    }
  }
  throw lastError;
}

main().catch((err) => {
  console.error("[migrate] failed:", err?.message || err);
  for (const key of ["code", "detail", "hint", "position", "where"]) {
    if (err?.[key] != null) console.error(`[migrate]   ${key}: ${err[key]}`);
  }
  process.exit(1);
});
