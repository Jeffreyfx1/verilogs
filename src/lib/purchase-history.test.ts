import assert from "node:assert/strict";
import test from "node:test";
import { airtimeSalesOpen, facebookOrderAccounts, historyFilterFromHash, isRetiredBill, listPurchases, orderQuantity, pagePurchases, purchaseStatusLabel, purchaseTypeLabel, smmSalesOpen, type HistoryOrder } from "./purchase-history.ts";

const rows: HistoryOrder[] = [
  { id: "log-1", userId: "ada", category: "logs", title: "Facebook followers pack", amount: 1500, status: "completed", createdAt: "2026-11-01T10:00:00.000Z", detail: "pack" },
  { id: "vpn-1", userId: "ada", category: "vpn", title: "Month VPN", amount: 4000, status: "waiting", createdAt: "2026-11-02T10:00:00.000Z", detail: JSON.stringify({ quantity: 2 }) },
  { id: "num-1", userId: "ada", category: "numbers", title: "WhatsApp USA", amount: 900, status: "received", createdAt: "2026-11-03T10:00:00.000Z", phone: "+15550001", code: "1234" },
  { id: "rent-1", userId: "ada", category: "rent", title: "Rent Telegram", amount: 2500, status: "refunded", createdAt: "2026-11-04T10:00:00.000Z", phone: "+447700900" },
  { id: "smm-1", userId: "ada", category: "smm", title: "Instagram likes", amount: 800, status: "completed", createdAt: "2026-11-05T10:00:00.000Z", detail: JSON.stringify({ quantity: 1000 }) },
  { id: "data-1", userId: "ada", category: "data", title: "MTN 1GB", amount: 500, status: "completed", createdAt: "2026-11-06T10:00:00.000Z" },
  { id: "bill-1", userId: "ada", category: "cable", title: "DStv Padi", amount: 2500, status: "completed", createdAt: "2026-10-01T10:00:00.000Z" },
  { id: "log-1", userId: "ada", category: "logs", title: "Facebook followers pack", amount: 9999, status: "completed", createdAt: "2026-11-01T10:00:00.000Z" },
  { id: "other-user", userId: "bola", category: "logs", title: "Secret pack", amount: 5000, status: "completed", createdAt: "2026-11-07T10:00:00.000Z" },
];

test("purchase history keeps one user's real orders and their statuses", () => {
  const all = listPurchases(rows, { userId: "ada", filter: "all" });
  assert.deepEqual(all.map((row) => row.id), ["data-1", "smm-1", "rent-1", "num-1", "vpn-1", "log-1", "bill-1"]);
  assert.equal(all.find((row) => row.id === "log-1")?.amount, 1500);
  assert.equal(all.find((row) => row.id === "rent-1")?.status, "refunded");
  assert.equal(all.find((row) => row.id === "vpn-1")?.status, "waiting");
  assert.equal(listPurchases(rows, { userId: "bola", filter: "all" }).some((row) => row.userId === "ada"), false);
});

test("filters and search cover logs, vpn, numbers and other products", () => {
  assert.deepEqual(listPurchases(rows, { userId: "ada", filter: "logs" }).map((row) => row.id), ["log-1"]);
  assert.deepEqual(listPurchases(rows, { userId: "ada", filter: "vpn" }).map((row) => row.id), ["vpn-1"]);
  assert.deepEqual(listPurchases(rows, { userId: "ada", filter: "numbers" }).map((row) => row.id), ["rent-1", "num-1"]);
  assert.deepEqual(listPurchases(rows, { userId: "ada", filter: "bought" }).map((row) => row.id), ["num-1"]);
  assert.deepEqual(listPurchases(rows, { userId: "ada", filter: "data" }).map((row) => row.id), ["data-1"]);
  assert.deepEqual(listPurchases(rows, { userId: "ada", filter: "rent" }).map((row) => row.id), ["rent-1"]);
  assert.deepEqual(listPurchases(rows, { userId: "ada", filter: "other" }).map((row) => row.id), ["data-1", "smm-1", "bill-1"]);
  assert.deepEqual(listPurchases(rows, { userId: "ada", filter: "all", q: "whatsapp" }).map((row) => row.id), ["num-1"]);
  assert.equal(purchaseTypeLabel("logs"), "Logs");
  assert.equal(purchaseTypeLabel("smm"), "SMM");
  assert.equal(orderQuantity(JSON.stringify({ quantity: 1000 })), 1000);
  assert.equal(orderQuantity("plain description"), 1);
  const page = pagePurchases(listPurchases(rows, { userId: "ada", filter: "all" }), 2, 1);
  assert.equal(page.rows.length, 2);
  assert.equal(page.more, true);
  assert.equal(historyFilterFromHash("bills"), "all");
  assert.equal(historyFilterFromHash("numbers"), "numbers");
  assert.equal(historyFilterFromHash("rent"), "rent");
  assert.equal(historyFilterFromHash("data"), "data");
  assert.equal(historyFilterFromHash("usa"), "bought");
  assert.equal(purchaseTypeLabel("rent"), "Rent");
  assert.equal(purchaseStatusLabel({ status: "waiting", category: "numbers" }), "Waiting for SMS");
  assert.equal(purchaseStatusLabel({ status: "completed", category: "data" }), "Completed");
  assert.equal(purchaseStatusLabel({ status: "waiting", category: "data" }), "Processing");
  assert.equal(purchaseStatusLabel({ status: "refunded", category: "numbers", providerStatus: "CANCELED" }), "Cancelled");
  assert.equal(purchaseStatusLabel({ status: "refunded", category: "data" }), "Refunded");
  assert.equal(purchaseStatusLabel({ status: "waiting", category: "numbers", providerStatus: "FAILED" }), "Failed");
  assert.equal(purchaseStatusLabel({ status: "waiting", category: "rent", expiresAt: "2020-01-01T00:00:00.000Z" }), "Waiting for SMS");
  assert.equal(purchaseStatusLabel({ status: "waiting", category: "usa", providerStatus: "expired" }), "Expired");
  assert.equal(purchaseStatusLabel({ status: "received", category: "numbers", code: "1234" }), "OTP received");
});

test("airtime and SMM sales stay closed and bill categories cannot be bought", () => {
  assert.equal(airtimeSalesOpen(), false);
  assert.equal(smmSalesOpen(), false);
  for (const category of ["cable", "electricity", "exam", "giftcard", "betting"]) assert.equal(isRetiredBill(category), true);
  for (const category of ["logs", "vpn", "numbers", "data", "smm", "airtime"]) assert.equal(isRetiredBill(category), false);
});

test("a Facebook order summary uses the labelled fields and not the raw provider line", () => {
  const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  const raw = `buyer@example.com:FbPassw0rd:MailPass99:${secret}:https://facebook.com/buyer`;
  const detail = "Facebook account\nAccount format: Facebook Email : Facebook Password : Email Password : 2FA Code : Profile Link";
  const accounts = facebookOrderAccounts({ category: "logs", title: "USA Facebook", service: "Facebook", code: raw, detail });
  assert.ok(accounts);
  assert.deepEqual(accounts[0]?.fields.map((field) => field.label), ["User ID (Login ID)", "Facebook Password", "2FA Key (Secret)", "Linked Email Password"]);
  assert.equal(JSON.stringify(accounts).includes(raw), false);
  assert.equal(accounts[0]?.guide?.heading, "Links to get Code from 2FA-Key");
  assert.equal(facebookOrderAccounts({ category: "logs", title: "Facebook followers pack", code: raw, detail: "pack" }), null);
  assert.equal(facebookOrderAccounts({ category: "numbers", title: "Facebook", code: "123456" }), null);
});
