import assert from "node:assert/strict";
import test from "node:test";
import { mergeServicePrices, pageServices, SERVICE_PAGE } from "./service-search.ts";

function names(count: number, label: string) {
  return Array.from({ length: count }, (_, index) => ({
    service: `${label}-${String(index).padStart(4, "0")}`,
    externalId: `${label}|svc-${index}`,
    country: label,
  }));
}

test("search finds Telegram past 100, 500 and 1000 without returning the whole catalogue", () => {
  const rows = names(1000, "aaa");
  rows[999] = { service: "Telegram", externalId: "usa|telegram|main", country: "United States" };
  const searched = pageServices(rows, "telegram", "");
  assert.equal(searched.rows[0]?.service, "Telegram");
  assert.ok(searched.rows.length <= SERVICE_PAGE);
  assert.equal(searched.more, false);
  const first = pageServices(rows, "", "");
  assert.equal(first.rows.length, SERVICE_PAGE);
  assert.equal(first.more, true);
  assert.equal(first.rows.some((row) => row.service === "Telegram"), false);
  const seen = new Set<string>();
  let after = "";
  let pages = 0;
  while (pages < 40) {
    const page = pageServices(rows, "", after);
    const before = seen.size;
    for (const row of page.rows) seen.add(row.service);
    assert.equal(seen.size, before + page.rows.length);
    if (!page.more) break;
    assert.notEqual(page.next, after);
    after = page.next;
    pages += 1;
  }
  assert.equal(seen.size, 1000);
  assert.equal(seen.has("Telegram"), true);
});

test("GetaText USA and each number server search the whole imported list", () => {
  const catalogues = [
    ["getatext", 519],
    ["server1", 831],
    ["server2", 240],
    ["server3", 180],
  ] as const;
  for (const [label, count] of catalogues) {
    const rows = names(count, label);
    rows[count - 1] = { service: "Telegram", externalId: `${label}|telegram|id`, country: label };
    assert.equal(rows.slice(0, 100).some((row) => row.service === "Telegram"), false, label);
    const page = pageServices(rows, "Telegram", "");
    assert.equal(page.rows[0]?.service, "Telegram", label);
    assert.equal(page.rows[0]?.externalId, `${label}|telegram|id`, label);
  }
});

test("provider service id matches when the display name does not", () => {
  const page = pageServices(
    [
      { service: "Other", externalId: "usa|telegram|area", country: "United States" },
      { service: "Alpha", externalId: "usa|alpha|1", country: "United States" },
    ],
    "telegram",
    "",
  );
  assert.deepEqual(page.rows.map((row) => row.service), ["Other"]);
});

test("exact and prefix names sort ahead of a later contains match", () => {
  const page = pageServices(
    [
      { service: "Not Telegram" },
      { service: "Telegram Extra" },
      { service: "Telegram" },
    ],
    "telegram",
    "",
  );
  assert.deepEqual(page.rows.map((row) => row.service), ["Telegram", "Telegram Extra", "Not Telegram"]);
});

test("a zero price does not drop the service", () => {
  const merged = mergeServicePrices([
    { service: "Telegram", price: 0 },
    { service: "Telegram", price: 0 },
    { service: "WhatsApp", price: 900 },
    { service: "WhatsApp", price: 400 },
  ]);
  assert.deepEqual(merged, [
    { service: "Telegram", price: 0 },
    { service: "WhatsApp", price: 400 },
  ]);
});
