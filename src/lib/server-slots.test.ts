import assert from "node:assert/strict";
import test from "node:test";
import { freshData, resolveNumberServer, serverLabel, serverSlots, type Provider } from "./catalog.ts";
import { projectShop } from "./shop-logic.ts";

function provider(patch: Partial<Provider> & Pick<Provider, "id" | "name" | "createdAt">): Provider {
  return {
    baseUrl: "https://provider.example/api",
    hasKey: true,
    servesNumbers: true,
    enabled: true,
    currency: "USD",
    usdRate: 1600,
    markup: 1,
    operatorMarkups: {},
    operatorPrices: {},
    importType: "NUMBER_IMPORT",
    serverId: "1",
    markupPercent: 0,
    lastSync: null,
    ...patch,
  };
}

test("repeated server id 1 still labels each number provider once", () => {
  const providers = [
    provider({ id: "a", name: "5sim", serverId: "1", createdAt: "2026-01-01T00:00:00.000Z" }),
    provider({ id: "b", name: "Server 2", serverId: "1", createdAt: "2026-01-02T00:00:00.000Z" }),
    provider({ id: "c", name: "Server 3", serverId: "1", createdAt: "2026-01-03T00:00:00.000Z" }),
  ];
  const slots = serverSlots(providers);
  assert.equal(slots.size, 3);
  assert.equal(serverLabel(providers, "a"), "Server 1");
  assert.equal(serverLabel(providers, "b"), "Server 2");
  assert.equal(serverLabel(providers, "c"), "Server 3");
  assert.deepEqual(new Set(slots.values()), new Set(["1", "2", "3"]));
});

test("unique stored server ids are kept and a single provider is not copied", () => {
  const one = [provider({ id: "only", name: "5sim", serverId: "1", createdAt: "2026-01-01T00:00:00.000Z" })];
  assert.equal(serverSlots(one).size, 1);
  assert.equal(serverLabel(one, "only"), "Server 1");
  const three = [
    provider({ id: "a", name: "5sim", serverId: "1", createdAt: "2026-03-01T00:00:00.000Z" }),
    provider({ id: "b", name: "Harbour", serverId: "2", createdAt: "2026-01-01T00:00:00.000Z" }),
    provider({ id: "c", name: "Text", serverId: "3", createdAt: "2026-02-01T00:00:00.000Z" }),
  ];
  assert.equal(serverLabel(three, "a"), "Server 1");
  assert.equal(serverLabel(three, "b"), "Server 2");
  assert.equal(serverLabel(three, "c"), "Server 3");
});

test("usa and non-number providers are not extra number servers", () => {
  const providers = [
    provider({ id: "a", name: "5sim", serverId: "1", createdAt: "2026-01-01T00:00:00.000Z" }),
    provider({ id: "usa", name: "GetaText", serverId: "usa", importType: "USA_IMPORT", servesNumbers: false, createdAt: "2026-01-01T00:00:00.000Z" }),
    provider({ id: "air", name: "SMEAPI Airtime", serverId: "", importType: "VTU_IMPORT", servesNumbers: false, createdAt: "2026-01-01T00:00:00.000Z" }),
  ];
  assert.deepEqual([...serverSlots(providers).keys()], ["a"]);
  assert.equal(serverLabel(providers, "usa"), "USA");
});

test("a customer still receives a distinct server id after the provider name is hidden", () => {
  const data = freshData();
  data.providers = [
    provider({ id: "a", name: "5sim", serverId: "1", createdAt: "2026-01-01T00:00:00.000Z" }),
    provider({ id: "b", name: "Server 2", serverId: "1", createdAt: "2026-01-02T00:00:00.000Z" }),
    provider({ id: "c", name: "Server 3", serverId: "1", createdAt: "2026-01-03T00:00:00.000Z" }),
  ];
  data.users.push({
    id: "cust",
    name: "Ada",
    email: "ada@example.com",
    phone: "08030000000",
    passwordHash: "x",
    google: false,
    role: "customer",
    balance: 0,
    createdAt: "2026-01-05T00:00:00.000Z",
  });
  const view = projectShop(data, "cust", null);
  const labels = view.providers.filter((item) => item.servesNumbers).map((item) => item.serverId);
  assert.deepEqual(labels, ["1", "2", "3"]);
  assert.equal(view.providers.find((item) => item.id === "b")?.name, "");
  assert.equal(serverLabel(view.providers, "b"), "Server 2");
  assert.equal(serverLabel(view.providers, "c"), "Server 3");
});

test("a fourth number provider is not given Server 4", () => {
  const providers = [
    provider({ id: "a", name: "5sim", serverId: "1", createdAt: "2026-01-01T00:00:00.000Z" }),
    provider({ id: "b", name: "Server 2", serverId: "2", createdAt: "2026-01-02T00:00:00.000Z" }),
    provider({ id: "c", name: "Server 3", serverId: "3", createdAt: "2026-01-03T00:00:00.000Z" }),
    provider({ id: "d", name: "5sim again", serverId: "1", createdAt: "2026-01-04T00:00:00.000Z" }),
    provider({ id: "rent", name: "Rent number", serverId: "", importType: "RANDOM_IMPORT", servesNumbers: false, createdAt: "2026-01-04T00:00:00.000Z" }),
  ];
  const slots = [...serverSlots(providers).values()];
  assert.deepEqual(slots.sort(), ["1", "2", "3"]);
  assert.equal(serverSlots(providers).has("d"), false);
  assert.equal(serverSlots(providers).has("rent"), false);
  assert.equal(serverLabel(providers, "d"), null);
  const same = resolveNumberServer(providers, "2", "a");
  const extra = resolveNumberServer(providers, "1", "d");
  assert.equal("error" in same ? same.error : "", "That provider is Server 1. The import was not moved.");
  assert.equal("error" in extra ? extra.error : "", "That provider is not Server 1. The import was not moved.");
  const open = [
    provider({ id: "a", name: "5sim", serverId: "1", createdAt: "2026-01-01T00:00:00.000Z" }),
  ];
  const created = resolveNumberServer(open, "2");
  const kept = resolveNumberServer(open, "1");
  assert.equal("create" in created && created.create, true);
  assert.equal("providerId" in kept ? kept.providerId : "", "a");
});
