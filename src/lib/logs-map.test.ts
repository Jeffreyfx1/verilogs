import assert from "node:assert/strict";
import test from "node:test";
import { mapLogProducts, publicHttpsUrl, publicImage, ACCSZONE_MAP } from "./logs-map.ts";

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
  assert.equal(rows[0]?.price, 4.5);
  assert.equal(rows[0]?.externalId, "12");
});

test("uses the provider logo even when the field name or path differs", () => {
  const rows = mapLogProducts({
    data: [
      { id: 1, title: "Instagram followers", price: 2, category: { title: "Instagram", logo: { url: "https://cdn.example.com/ig" } } },
      { id: 2, title: "Instagram likes", price: 1, category: { title: "Instagram" } },
      { id: 3, title: "Page", price: 1, icon: "https://cdn.example.com/page.html" },
      { id: 4, title: "Local", price: 1, image: "http://cdn.example.com/local.png" },
    ],
  }, ACCSZONE_MAP);
  assert.equal(rows[0]?.imageUrl, "https://cdn.example.com/ig");
  assert.equal(rows[1]?.imageUrl, "https://cdn.example.com/ig");
  assert.equal(rows[2]?.imageUrl, "");
  assert.equal(rows[3]?.imageUrl, "");
  assert.equal(rows[2]?.name, "Page");
  assert.equal(publicImage("https://cdn.example.com/logo"), "https://cdn.example.com/logo");
});

test("blocks private provider URLs", () => {
  assert.equal(publicHttpsUrl("http://accszone.com/api", "/listings").ok, false);
  assert.equal(publicHttpsUrl("https://127.0.0.1/api", "/listings").ok, false);
  assert.equal(publicHttpsUrl("https://accszone.com/api/v1", "/listings").ok, true);
});
