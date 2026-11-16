import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { followCatalogPages, nextCatalogUrl } from "./catalog-pages.ts";

describe("catalog pages", () => {
  it("follows a last_page catalogue instead of stopping on the first 15", async () => {
    const start = new URL("https://provider.example/api/products");
    const page = (n: number) => ({
      current_page: n,
      last_page: 3,
      per_page: 15,
      data: Array.from({ length: n === 3 ? 4 : 15 }, (_, i) => ({ id: (n - 1) * 15 + i + 1, name: `Item ${(n - 1) * 15 + i + 1}` })),
    });
    const seen: string[] = [];
    const merged = await followCatalogPages(start, page(1), async (url) => {
      seen.push(url.search);
      if (url.searchParams.get("per_page") === "500") return page(1);
      const n = Number(url.searchParams.get("page") || 1);
      return page(n);
    });
    const rows = (merged as { data: { id: number }[] }).data;
    assert.ok(seen.some((query) => query.includes("per_page=500")));
    assert.ok(seen.some((query) => query.includes("page=2")));
    assert.ok(seen.some((query) => query.includes("page=3")));
    assert.equal(rows.length, 34);
    assert.equal(rows[0].id, 1);
    assert.equal(rows[33].id, 34);
  });

  it("stops when a later page repeats the same ids", async () => {
    const start = new URL("https://provider.example/api/products?page=1");
    const body = { data: Array.from({ length: 15 }, (_, i) => ({ id: i + 1 })) };
    let calls = 0;
    const merged = await followCatalogPages(start, body, async () => {
      calls += 1;
      return body;
    });
    assert.equal(calls, 1);
    assert.equal(merged, body);
  });

  it("reads a next URL and a cursor", () => {
    const start = new URL("https://provider.example/api/products?page=1");
    const next = nextCatalogUrl(start, { data: [], next_page_url: "https://provider.example/api/products?page=2" }, 1, 15, 15);
    assert.equal(next?.searchParams.get("page"), "2");
    const cursor = nextCatalogUrl(start, { items: [], next_cursor: "abc" }, 1, 20, 20);
    assert.equal(cursor?.searchParams.get("cursor"), "abc");
  });
});
