import assert from "node:assert/strict";
import test from "node:test";
import { freshData, type Product, type Provider } from "./catalog.ts";
import { buyProduct, registerUser } from "./shop-logic.ts";

test("admins get an in-app note when a customer joins or buys", async () => {
  const joined = await registerUser(freshData(), {
    name: "Ada Buyer",
    email: "ada-note@example.com",
    phone: "08031234567",
    password: "password1",
  });
  assert.equal(joined.error, null);
  const signup = joined.data.notifications.find((note) => note.userId === "usr_admin");
  assert.equal(signup?.title, "Ada Buyer joined VeriLogs");
  assert.equal(signup?.body, "ada-note@example.com");
  assert.equal(signup?.href, "/admin/customers");
  const ada = joined.data.users.find((user) => user.email === "ada-note@example.com");
  assert.ok(ada);
  const provider: Provider = {
    id: "prv",
    name: "Logs",
    baseUrl: "https://example.com",
    hasKey: true,
    servesNumbers: false,
    enabled: true,
    currency: "NGN",
    usdRate: 1,
    markup: 0,
    operatorMarkups: {},
    operatorPrices: {},
    createdAt: "2026-01-01T00:00:00.000Z",
    lastSync: null,
  };
  const product: Product = {
    id: "prd",
    providerId: "prv",
    externalId: "1",
    category: "logs",
    name: "Facebook log",
    service: "facebook",
    country: "",
    network: "",
    price: 1500,
    cost: 800,
    stock: 3,
    operator: "",
    rate: 0,
    rates: "",
    enabled: true,
    validity: "",
    variable: false,
    description: "",
  };
  const funded = {
    ...joined.data,
    users: joined.data.users.map((user) => (user.id === ada.id ? { ...user, balance: 5000 } : user)),
    providers: [provider],
    products: [product],
  };
  const bought = buyProduct(funded, ada.id, "prd", { charge: 1500 });
  assert.equal(bought.error, null);
  const purchase = bought.data.notifications.find((note) => note.userId === "usr_admin" && note.href === "/admin/orders");
  assert.equal(purchase?.title, "Ada Buyer made a purchase");
  assert.match(purchase?.body || "", /Facebook log/);
  assert.match(purchase?.body || "", /1,500/);
  assert.equal(bought.data.notifications.some((note) => note.userId === ada.id && /made a purchase/.test(note.title)), false);
});
