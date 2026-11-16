import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { walkBrowse } from "./catalog-pages.ts";

function page(n: number, last = 3, count = 15) {
  return {
    current_page: n,
    last_page: last,
    per_page: 15,
    total: last * 15,
    data: Array.from({ length: count }, (_, i) => ({
      id: (n - 1) * 15 + i + 1,
      name: i % 5 === 0 ? `Gmail row ${(n - 1) * 15 + i + 1}` : `Other row ${(n - 1) * 15 + i + 1}`,
      description: "Full description stays on the row.",
    })),
  };
}

describe("browse catalogue", () => {
  it("returns one window and a cursor into the same page", async () => {
    const start = new URL("https://provider.example/api/products");
    const body = {
      current_page: 1,
      last_page: 1,
      per_page: 100,
      total: 100,
      data: Array.from({ length: 100 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` })),
    };
    const first = await walkBrowse({ start, first: body, from: 0, q: "", fetchPage: async () => null, limit: 40 });
    assert.equal(first.items.length, 40);
    assert.equal(first.total, 100);
    assert.match(first.nextCursor, /vl_from=40/);
    const from = Number(new URL(first.nextCursor).searchParams.get("vl_from"));
    const second = await walkBrowse({ start, first: body, from, q: "", fetchPage: async () => null, limit: 40 });
    assert.equal((second.items[0] as { id: number }).id, 41);
    assert.equal(second.items.length, 40);
  });

  it("searches later pages and keeps the raw row", async () => {
    const start = new URL("https://provider.example/api/products");
    const seen: string[] = [];
    const found = await walkBrowse({
      start,
      first: page(1),
      from: 0,
      q: "gmail",
      limit: 6,
      extraHops: 5,
      fetchPage: async (url) => {
        seen.push(url.search);
        if (url.searchParams.get("per_page") === "500") return page(1);
        const n = Number(url.searchParams.get("page") || 1);
        return page(n);
      },
    });
    assert.equal(found.items.length, 6);
    assert.ok(seen.some((query) => query.includes("page=2")));
    assert.match(String((found.items[0] as { description: string }).description), /Full description/);
    assert.ok(found.nextCursor);
  });

  it("stops when the next page repeats the same products", async () => {
    const start = new URL("https://provider.example/api/products");
    const body = { data: Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` })) };
    let calls = 0;
    const found = await walkBrowse({
      start,
      first: body,
      from: 0,
      q: "missing",
      extraHops: 4,
      fetchPage: async () => {
        calls += 1;
        return body;
      },
    });
    assert.equal(found.items.length, 0);
    assert.equal(calls, 1);
    assert.equal(found.nextCursor, "");
  });
});
