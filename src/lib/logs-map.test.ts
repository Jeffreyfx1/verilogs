import assert from "node:assert/strict";
import test from "node:test";
import { mapLogProducts, publicHttpsUrl, ACCSZONE_MAP } from "./logs-map.ts";

test("maps nested provider fields and drops credential-looking text", () => {
  const rows = mapLogProducts({
    data: [
      { id: 12, title: "TikTok likes pack", description: "Delivered to the profile you choose.", price: "4.50", available_stock: 8, category: { title: "TikTok", image: "https://cdn.example.com/tiktok.png" }, subcategory: { title: "Likes" } },
      { id: 13, title: "Secret dump", description: "user@mail.com:hunter2 extra:secret", price: "1", available_stock: 1, category: { title: "Mail" } },
      { id: 14, title: "Has password", password: "nope", price: "2", category: { title: "Mail" } },
    ],
  }, ACCSZONE_MAP);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.category, "TikTok");
  assert.equal(rows[0]?.subcategory, "Likes");
  assert.equal(rows[0]?.imageUrl, "https://cdn.example.com/tiktok.png");
  assert.equal(rows[0]?.description.includes("profile"), true);
  assert.equal(rows[1]?.description, "");
});

test("blocks private provider URLs", () => {
  assert.equal(publicHttpsUrl("http://accszone.com/api", "/listings").ok, false);
  assert.equal(publicHttpsUrl("https://127.0.0.1/api", "/listings").ok, false);
  assert.equal(publicHttpsUrl("https://accszone.com/api/v1", "/listings").ok, true);
});
