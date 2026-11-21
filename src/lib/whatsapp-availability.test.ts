import assert from "node:assert/strict";
import test from "node:test";
import type { Product } from "@/lib/catalog";
import { slimFiveSim, extractCatalog, shapeImport } from "@/lib/categorize";
import { getSql } from "@/lib/db";
import { queryOperators, queryServices, queryWhatsAppOffer, upsertProductRows } from "@/lib/product-rows.server";
import {
  finishServicePage,
  isFiveSimServer1,
  isWhatsAppService,
  preferWhatsApp,
  wantsWhatsAppLookup,
} from "./whatsapp-availability.ts";

const five = { baseUrl: "https://5sim.net/v1/guest/prices", serverId: "1" };
const other = { baseUrl: "https://example.com/api", serverId: "2" };

test("WhatsApp is recognised without treating WhatsApp2 as the same service", () => {
  assert.equal(isWhatsAppService("WhatsApp"), true);
  assert.equal(isWhatsAppService("whats app"), true);
  assert.equal(isWhatsAppService("WhatsApp2"), false);
  assert.equal(isWhatsAppService("Telegram"), false);
  assert.equal(wantsWhatsAppLookup(""), true);
  assert.equal(wantsWhatsAppLookup("wa"), false);
  assert.equal(wantsWhatsAppLookup("what"), true);
  assert.equal(wantsWhatsAppLookup("WhatsApp"), true);
  assert.equal(wantsWhatsAppLookup("telegram"), false);
  assert.equal(wantsWhatsAppLookup("google"), false);
});

test("only FiveSim Number Server 1 gets the WhatsApp lookup", () => {
  assert.equal(isFiveSimServer1(five), true);
  assert.equal(isFiveSimServer1({ baseUrl: "https://5sim.net", serverId: "" }), true);
  assert.equal(isFiveSimServer1({ baseUrl: "https://5sim.net", serverId: "2" }), false);
  assert.equal(isFiveSimServer1(other), false);
  assert.equal(isFiveSimServer1({ baseUrl: "https://getatext.com", serverId: "usa" }), false);
  assert.equal(isFiveSimServer1(null), false);
});

test("a capped page gains one real WhatsApp row and other services stay put", () => {
  const ranked = [
    ...Array.from({ length: 120 }, (_, i) => ({ service: `Svc ${String(i).padStart(3, "0")}`, price: 1000 + i })),
    { service: "Telegram", price: 900 },
    { service: "WhatsApp", price: 1500 },
  ].sort((a, b) => a.service.localeCompare(b.service));
  const page = finishServicePage(ranked, 100, { fiveSim: true, q: "", offer: { service: "WhatsApp", price: 1500 } });
  assert.equal(page.length, 101);
  assert.deepEqual(page.slice(0, 100), ranked.slice(0, 100));
  assert.equal(page.at(-1)?.service, "WhatsApp");
  assert.equal(page.some((row) => row.service === "Telegram"), false);
  const searched = finishServicePage(ranked, 100, { fiveSim: true, q: "telegram", offer: { service: "WhatsApp", price: 1500 } });
  assert.equal(searched.some((row) => row.service === "WhatsApp"), false);
  const server2 = finishServicePage(ranked, 100, { fiveSim: false, q: "", offer: { service: "WhatsApp", price: 1500 } });
  assert.equal(server2.some((row) => row.service === "WhatsApp"), false);
  const already = finishServicePage(
    [{ service: "Google", price: 800 }, { service: "WhatsApp", price: 1500 }],
    100,
    { fiveSim: true, q: "", offer: { service: "WhatsApp", price: 1500 } },
  );
  assert.deepEqual(already.map((row) => row.service), ["Google", "WhatsApp"]);
  assert.equal(preferWhatsApp([{ service: "Whats App", price: 1 }, { service: "WhatsApp", price: 2 }])?.service, "WhatsApp");
  assert.equal(finishServicePage(ranked, 100, { fiveSim: true, q: "", offer: null }).some((row) => isWhatsAppService(row.service)), false);
});

function row(partial: Partial<Product> & Pick<Product, "id" | "providerId" | "externalId" | "service" | "country">): Product {
  return {
    category: "number",
    name: partial.service,
    network: "",
    price: 1800,
    cost: 2,
    stock: 5,
    operator: "virtual34",
    rate: 40,
    rates: "",
    enabled: true,
    validity: "",
    variable: false,
    description: "",
    importType: "NUMBER_IMPORT",
    serverId: "1",
    ...partial,
  };
}

test("a stocked WhatsApp row past the catalogue cap is still offered for several countries", async () => {
  const providerId = "prov-5sim-wa-cap";
  const otherId = "prov-server2-wa";
  const products: Product[] = [];
  for (let i = 0; i < 410; i++) {
    products.push(row({
      id: `wa-cap-${i}`,
      providerId,
      externalId: `svc-${i}`,
      service: `Svc ${String(i).padStart(3, "0")}`,
      country: "Nigeria",
    }));
  }
  products.push(
    row({ id: "wa-ng", providerId, externalId: "wa-ng", service: "WhatsApp", country: "Nigeria", operator: "virtual34", stock: 9, price: 2100 }),
    row({ id: "wa2-ng", providerId, externalId: "wa2-ng", service: "WhatsApp2", country: "Nigeria", stock: 3 }),
    row({ id: "tg-ng", providerId, externalId: "tg-ng", service: "Telegram", country: "Nigeria", stock: 4 }),
    row({ id: "go-ng", providerId, externalId: "go-ng", service: "Google", country: "Nigeria", stock: 8, price: 1200 }),
    row({ id: "fb-ng", providerId, externalId: "fb-ng", service: "Facebook", country: "Nigeria", stock: 6, price: 1100 }),
    row({ id: "wa-uk", providerId, externalId: "wa-uk", service: "WhatsApp", country: "United Kingdom", operator: "virtual51", stock: 6, price: 2500 }),
    row({ id: "wa-de", providerId, externalId: "wa-de", service: "WhatsApp", country: "Germany", stock: 0, price: 2500 }),
    row({ id: "wa-br", providerId, externalId: "wa-br", service: "WhatsApp", country: "Brazil", stock: 4, enabled: false }),
    row({ id: "wa-id", providerId, externalId: "wa-id", service: "Whats App", country: "Indonesia", stock: 2, price: 1900 }),
    row({ id: "wa-s2", providerId: otherId, externalId: "wa-s2", service: "WhatsApp", country: "Nigeria", serverId: "2", stock: 7 }),
  );
  const sql = await getSql();
  try {
    await upsertProductRows(products, "job-wa-cap");
    const browse = { providerId, category: "number", country: "Nigeria", admin: false, enabledProviderIds: [providerId] };
    const listed = await queryServices(browse);
    assert.equal(listed.some((item) => item.service === "WhatsApp"), false);
    assert.equal(listed.some((item) => item.service === "Telegram"), false);
    assert.equal(listed.some((item) => item.service === "Google"), true);
    assert.equal(listed.some((item) => item.service === "Facebook"), true);
    const offer = await queryWhatsAppOffer(browse);
    assert.deepEqual(offer.map((item) => item.service), ["WhatsApp"]);
    const ranked = listed
      .map((item) => ({ service: item.service, price: item.price }))
      .sort((a, b) => a.service.localeCompare(b.service));
    const page = finishServicePage(ranked, 100, { fiveSim: true, q: "", offer: preferWhatsApp(offer.map((item) => ({ service: item.service, price: item.price }))) });
    assert.equal(page.filter((item) => item.service === "WhatsApp").length, 1);
    assert.deepEqual(page.slice(0, 100).map((item) => item.service), ranked.slice(0, 100).map((item) => item.service));
    assert.equal(page.some((item) => item.service === "Telegram"), false);
    const operators = await queryOperators({ ...browse, service: "WhatsApp" });
    assert.equal(operators.length, 1);
    assert.equal(operators[0]?.operator, "virtual34");
    assert.equal(operators[0]?.stock, 9);
    const uk = await queryWhatsAppOffer({ ...browse, country: "United Kingdom" });
    assert.equal(uk[0]?.service, "WhatsApp");
    assert.equal((await queryOperators({ ...browse, country: "United Kingdom", service: "WhatsApp" }))[0]?.operator, "virtual51");
    assert.equal((await queryWhatsAppOffer({ ...browse, country: "Germany" })).length, 0);
    assert.equal((await queryWhatsAppOffer({ ...browse, country: "India" })).length, 0);
    assert.equal((await queryWhatsAppOffer({ ...browse, country: "Brazil" })).length, 0);
    const indonesia = await queryWhatsAppOffer({ ...browse, country: "Indonesia" });
    assert.equal(indonesia[0]?.service, "Whats App");
    const leaked = await queryWhatsAppOffer(browse);
    assert.equal(leaked.every((item) => item.providerId === providerId), true);
    const server2 = await queryWhatsAppOffer({ providerId: otherId, category: "number", country: "Nigeria", admin: false, enabledProviderIds: [otherId] });
    assert.equal(server2[0]?.service, "WhatsApp");
    const capped = Array.from({ length: 120 }, (_, i) => ({ service: `Svc ${String(i).padStart(3, "0")}`, price: 1000 }));
    const otherServer = finishServicePage(capped, 100, { fiveSim: false, q: "", offer: { service: "WhatsApp", price: server2[0]?.price || 1 } });
    assert.equal(otherServer.some((item) => item.service === "WhatsApp"), false);
    assert.equal(otherServer.length, 100);
  } finally {
    await sql.query("delete from shop_products where provider_id = any($1::text[])", [[providerId, otherId]]);
  }
});

test("live FiveSim prices stock WhatsApp through the same parser as a working service", async () => {
  const load = async (product: string) => {
    const res = await fetch(`https://5sim.net/v1/guest/prices?product=${product}`);
    const text = await res.text();
    assert.equal(res.status, 200, text.slice(0, 180));
    return shapeImport(extractCatalog(slimFiveSim(JSON.parse(text))).items, "numbers", []);
  };
  const whatsapp = await load("whatsapp");
  const telegram = await load("telegram");
  assert.equal(whatsapp.every((item) => item.service === "WhatsApp"), true);
  assert.equal(telegram.every((item) => item.service === "Telegram"), true);
  assert.equal(whatsapp.every((item) => item.stock > 0 && item.price > 0), true);
  const watched = ["Nigeria", "United Kingdom", "Germany", "India", "Indonesia", "Brazil", "United States"];
  const stocked = watched.filter((country) => whatsapp.some((item) => item.country === country));
  assert.ok(stocked.length >= 4, `5sim WhatsApp was only stocked for ${stocked.join(", ") || "none of the watched countries"}`);
  const nigeriaWa = whatsapp.find((item) => item.country === "Nigeria");
  const nigeriaTg = telegram.find((item) => item.country === "Nigeria");
  assert.ok(nigeriaWa && nigeriaWa.stock > 0 && nigeriaWa.operator);
  assert.ok(nigeriaTg && nigeriaTg.stock > 0 && nigeriaTg.service === "Telegram");
  assert.equal(whatsapp.some((item) => item.country === "whatsapp" || item.service === "whatsapp"), false);
});
