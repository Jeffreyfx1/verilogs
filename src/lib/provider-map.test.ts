import assert from "node:assert/strict";
import test from "node:test";
import { classifyProduct, credentialSource, type MapProvider } from "./provider-map.ts";

const servers: MapProvider[] = [
  { id: "s1", name: "5sim", serverId: "1", importType: "NUMBER_IMPORT", enabled: true },
  { id: "s2", name: "Server 2", serverId: "2", importType: "NUMBER_IMPORT", enabled: true },
  { id: "s3", name: "Server 3", serverId: "3", importType: "NUMBER_IMPORT", enabled: true },
  { id: "logs", name: "AccsZone", serverId: "", importType: "RANDOM_IMPORT", enabled: true },
];

test("a product on a provider with a key is ready", () => {
  const verdict = classifyProduct(
    { id: "p", name: "WhatsApp", category: "number", providerId: "s1", externalId: "wa", serverId: "1", importType: "NUMBER_IMPORT" },
    servers,
    new Set(["s1"]),
    new Map(),
  );
  assert.equal(verdict.status, "ok");
});

test("a number product with no provider is repaired only to its own server", () => {
  const verdict = classifyProduct(
    { id: "p", name: "WhatsApp", category: "number", providerId: "", externalId: "wa", serverId: "2", importType: "NUMBER_IMPORT" },
    servers,
    new Set(["s2"]),
    new Map(),
  );
  assert.equal(verdict.status, "missing_provider");
  assert.equal(verdict.repairTo, "s2");
});

test("a product is not moved to another server", () => {
  const verdict = classifyProduct(
    { id: "p", name: "WhatsApp", category: "number", providerId: "gone", externalId: "wa", serverId: "1", importType: "NUMBER_IMPORT" },
    servers.filter((item) => item.id !== "s1"),
    new Set(["s2"]),
    new Map(),
  );
  assert.equal(verdict.repairTo, "");
  assert.equal(verdict.status, "needs_review");
});

test("logs credentials come from the log provider only for logs", () => {
  const logs = classifyProduct(
    { id: "p", name: "TikTok", category: "logs", providerId: "logs", externalId: "tt", serverId: "", importType: "RANDOM_IMPORT" },
    servers,
    new Set(),
    new Map([["logs", true]]),
  );
  assert.equal(logs.status, "ok");
  assert.equal(credentialSource("logs", "", "log-key").source, "log_provider");
  assert.equal(credentialSource("number", "", "log-key").apiKey, "");
  assert.equal(credentialSource("number", "server-key", "").source, "provider_keys");
});
