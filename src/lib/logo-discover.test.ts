import assert from "node:assert/strict";
import test from "node:test";
import { applyCategoryLogo, matchCategories, parseAccsZoneHtml } from "./logo-discover.ts";

const html = `
<a href="https://accszone.com/all_ads/buy-facebook-accounts" class="mega-title">
  <img src="https://accszone.com/uploads/1779197886_AccsZone Facebook.png" alt="Facebook Accounts" class="mega-title-img" width="24" height="24">
  <span>Facebook Accounts</span>
</a>
<a href="https://accszone.com/all_ads/buy-instagram-accounts" class="mega-title">
  <img src="https://accszone.com/uploads/1695830338-instagram-transparent-png-14.jpg" alt="Instagram Accounts" class="mega-title-img">
  <span>Instagram Accounts</span>
</a>
<a href="https://accszone.com/all_ads/browse-tiktok-accounts-for-sale" class="mega-title">
  <img src="https://accszone.com/uploads/1699253604-tiktok.png" alt="TikTok" class="mega-title-img">
  <span>TikTok</span>
</a>
<a href="https://accszone.com/all_ads/threads-social-platform" class="mega-title">
  <img src="https://accszone.com/uploads/1778696298_threads.jpg" alt="Threads" class="mega-title-img">
  <span>Threads</span>
</a>
<a href="https://accszone.com/all_ads/buy-telegram-accounts" class="mega-title">
  <img src="https://accszone.com/uploads/1721025076_ttt.jpg" alt="Telegram Accounts" class="mega-title-img">
  <span>Telegram Accounts</span>
</a>
<a href="https://accszone.com/all_ads/buy-google-voice-accounts" class="mega-title">
  <img src="https://accszone.com/uploads/voice.png" alt="Google Voice Accounts" class="mega-title-img">
  <span>Google Voice Accounts</span>
</a>
<a href="https://accszone.com/all_ads/buy-google-ads-accounts" class="mega-title">
  <img src="https://accszone.com/uploads/ads.png" alt="Google Ads Accounts" class="mega-title-img">
  <span>Google Ads Accounts</span>
</a>
<img src="https://accszone.com/uploads/listing_logos/3nMAeedbLd9g30cUe7nHKwby0DEP3KZztgoZBGbF.jpg" alt="Facebook Accounts USA Facebook accounts for sale">
<a href="https://accszone.com/all_ads/buy-facebook-accounts/buy-usa-facebook-accounts">view more (10 more)</a>
`;

test("category logos come from the menu and listing photos stay separate", () => {
  const found = parseAccsZoneHtml(html);
  assert.equal(found.categories.length, 7);
  assert.equal(found.categories[0]?.imageUrl, "https://accszone.com/uploads/1779197886_AccsZone%20Facebook.png");
  assert.equal(found.categories[0]?.format, "png");
  assert.equal(found.listings.length, 1);
  assert.equal(found.listings[0]?.category, "Facebook Accounts");
  assert.equal(found.listings[0]?.imageUrl.includes("/listing_logos/"), true);
  assert.equal(found.categories.some((item) => item.imageUrl.includes("listing_logos")), false);
  assert.equal(found.moreLinks, 1);
});

test("known service groups inherit one category logo and custom images stay", () => {
  const found = parseAccsZoneHtml(html);
  const matches = matchCategories([
    { name: "Facebook Followers", services: 40 },
    { name: "Facebook Likes", services: 12 },
    { name: "Instagram Views", services: 8 },
    { name: "TikTok Followers", services: 15 },
    { name: "Threads Accounts", services: 4 },
    { name: "Telegram", services: 6 },
    { name: "Google Ads", services: 2 },
    { name: "Other", services: 9 },
  ], found.categories);
  const byName = Object.fromEntries(matches.map((item) => [item.category, item]));
  assert.equal(byName["Facebook Followers"]?.status, "high");
  assert.equal(byName["Facebook Likes"]?.imageUrl, byName["Facebook Followers"]?.imageUrl);
  assert.equal(byName["Instagram Views"]?.status, "high");
  assert.equal(byName["TikTok Followers"]?.status, "high");
  assert.equal(byName["Threads Accounts"]?.status, "high");
  assert.equal(byName["Telegram"]?.status, "high");
  assert.equal(byName["Google Ads"]?.discoveredName, "Google Ads Accounts");
  assert.equal(byName.Other?.status, "none");
  const logos = Object.fromEntries(matches.filter((item) => item.status === "high").map((item) => [item.category, item.imageUrl]));
  const plain = applyCategoryLogo({ name: "FB page", price: 1500, subcategory: "Facebook Followers", imageUrl: "" }, logos);
  const custom = applyCategoryLogo({ name: "FB page", price: 1500, subcategory: "Facebook Followers", imageUrl: "https://cdn.example.com/custom.png" }, logos);
  assert.equal(plain.imageUrl, logos["Facebook Followers"]);
  assert.equal(plain.price, 1500);
  assert.equal(plain.name, "FB page");
  assert.equal(custom.imageUrl, "https://cdn.example.com/custom.png");
});

test("a stored category logo does not rewrite service rows", async () => {
  const { getSql } = await import("@/lib/db");
  const { saveCategoryLogo, servicesCovered } = await import("./logo-rows.server.ts");
  const sql = await getSql();
  const provider = "logo-test";
  await sql.query("delete from shop_products where provider_id = $1", [provider]);
  await sql.query("delete from shop_category_logos where category_name = 'Facebook Followers'");
  await sql.query(
    `insert into shop_products (id, provider_id, external_id, category, name, service, price, marketplace_subcategory, image_url, enabled)
     values ('logo-a', $1, 'a', 'logs', 'Facebook followers pack', 'facebook', 1500, 'Facebook Followers', '', true),
            ('logo-b', $1, 'b', 'logs', 'Custom facebook', 'facebook', 2200, 'Facebook Followers', 'https://cdn.example.com/custom.png', true)`,
    [provider],
  );
  const before = await sql.query<{ name: string; price: number; image_url: string }>("select name, price, image_url from shop_products where provider_id = $1 order by id", [provider]);
  const saved = await saveCategoryLogo({ category: "Facebook Followers", imageUrl: "https://accszone.com/uploads/1779197886_AccsZone%20Facebook.png", page: "https://accszone.com/all_ads/buy-facebook-accounts", filename: "facebook.png", format: "png", confidence: 0.92, custom: false, verified: true, note: "test", replace: true });
  assert.equal(saved.saved, true);
  assert.equal(await servicesCovered(["Facebook Followers"]), 1);
  const after = await sql.query<{ name: string; price: number; image_url: string }>("select name, price, image_url from shop_products where provider_id = $1 order by id", [provider]);
  assert.deepEqual(after, before);
  await sql.query("delete from shop_products where provider_id = $1", [provider]);
  await sql.query("delete from shop_category_logos where category_name = 'Facebook Followers'");
});

