import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { getSql } from "@/lib/db";
import { mergeMessages, parseFiveSimCheck, parseGetatextStatus, parseGetatextWebhook, purchaseView } from "@/lib/fulfilment";
import { acceptGetatextWebhook, rememberFulfilment, webhookHealth } from "@/lib/fulfilment.server";
import { paystackSignatureOk } from "@/lib/paystack-sign";

const orderId = "ord-fulfil-test";

async function cleanup() {
  const sql = await getSql();
  await sql.query("delete from shop_fulfilments where order_id = $1", [orderId]);
  await sql.query("delete from shop_webhook_events where provider = 'getatext' and (event_key like '900001:%' or summary like 'SMS 900001%' or summary = 'Rejected webhook' or summary = 'Unreadable payload' or error = 'Unmatched')");
}

test("purchase view shows only stored provider data", () => {
  const empty = purchaseView({ id: "a", category: "numbers", title: "WhatsApp", amount: 620, status: "waiting", phone: "", code: "should-not-show" });
  assert.equal(empty.phone, "");
  assert.equal(empty.code, "");
  assert.equal(empty.delivery.length, 0);
  assert.equal(empty.poll, false);
  assert.match(empty.note, /Nothing is shown until it arrives/);

  const base = { id: "b", category: "numbers", title: "WhatsApp", amount: 620, status: "waiting", phone: "+234800", providerOrderId: "55", country: "nigeria", service: "whatsapp" };
  const waiting = purchaseView(base);
  assert.equal(waiting.phone, "+234800");
  assert.equal(waiting.poll, true);
  assert.equal(waiting.country, "nigeria");

  const done = purchaseView({ ...base, id: "c", providerStatus: "TIMEOUT" });
  assert.equal(done.poll, false);

  const logs = purchaseView({ id: "d", category: "logs", title: "Gmail", amount: 900, status: "completed", delivery: "user@mail.com\nsecret-pass" });
  assert.deepEqual(logs.delivery, ["user@mail.com", "secret-pass"]);
  assert.equal(logs.poll, false);

  const fromCode = purchaseView({ id: "e", category: "data", title: "1GB", amount: 300, status: "completed", code: "VTU-REF-1" });
  assert.deepEqual(fromCode.delivery, ["VTU-REF-1"]);
});

test("parsers and message merge do not invent or duplicate SMS", () => {
  const five = parseFiveSimCheck({ status: "RECEIVED", phone: "+100", sms: [{ sender: "Google", text: "code 444", code: "444", created_at: "2026-01-01T00:00:00Z" }] });
  assert.equal(five.terminal, true);
  assert.equal(five.messages.length, 1);
  assert.equal(five.messages[0]?.code, "444");
  const again = mergeMessages(five.messages, five.messages);
  assert.equal(again.length, 1);

  const geta = parseGetatextStatus({ status: "active", number: "+1800", codes: ["111"], code: "111" });
  assert.equal(geta.terminal, false);
  assert.equal(geta.messages.length, 1);
  assert.equal(parseGetatextWebhook({ id: "12", number: "+1" }), null);
  assert.equal(parseGetatextWebhook({ id: "12", code: "999", number: "+1" })?.code, "999");
});

test("paystack signatures reject a forged body", () => {
  const raw = '{"event":"charge.success"}';
  const good = createHmac("sha512", "secret").update(raw).digest("hex");
  assert.equal(paystackSignatureOk(raw, good, "secret"), true);
  assert.equal(paystackSignatureOk(raw, good, "other"), false);
  assert.equal(paystackSignatureOk(raw + " ", good, "secret"), false);
  assert.equal(paystackSignatureOk(raw, "", "secret"), false);
  assert.equal(paystackSignatureOk(raw, good, ""), false);
});

test("getatext webhook rejects a bad token and stores one SMS", async () => {
  const previous = process.env.GETATEXT_WEBHOOK_TOKEN;
  await cleanup();
  try {
    delete process.env.GETATEXT_WEBHOOK_TOKEN;
    const closed = await acceptGetatextWebhook("anything", { id: "900001", code: "222" });
    assert.equal(closed.http, 503);

    process.env.GETATEXT_WEBHOOK_TOKEN = "test-token";
    const forged = await acceptGetatextWebhook("wrong", { id: "900001", code: "222" });
    assert.equal(forged.http, 401);
    const missing = await acceptGetatextWebhook("test-token", { hello: true });
    assert.equal(missing.http, 400);
    const unmatched = await acceptGetatextWebhook("test-token", { id: "900001", code: "222", number: "+1800555" });
    assert.equal(unmatched.http, 202);

    await rememberFulfilment({
      orderId,
      userId: "fulfil-user",
      category: "usa",
      title: "USA Google",
      providerId: "p1",
      provider: "getatext.com",
      providerRef: "900001",
      phone: "+1800555",
      country: "usa",
      service: "google",
      delivery: "",
      status: "waiting",
    });
    const accepted = await acceptGetatextWebhook("test-token", { id: "900001", code: "222", number: "+1800555", service_name: "Google", received_at: "2026-01-02T00:00:00Z" });
    assert.equal(accepted.http, 200);
    assert.equal(accepted.duplicate, false);
    const duplicate = await acceptGetatextWebhook("test-token", { id: "900001", code: "222", number: "+1800555", service_name: "Google", received_at: "2026-01-02T00:00:00Z" });
    assert.equal(duplicate.http, 200);
    assert.equal(duplicate.duplicate, true);
    const sql = await getSql();
    const rows = await sql.query<{ messages: string }>("select messages from shop_fulfilments where order_id = $1", [orderId]);
    const messages = JSON.parse(rows[0]?.messages || "[]") as Array<{ code: string }>;
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.code, "222");

    const health = await webhookHealth();
    const geta = health.find((row) => row.id === "getatext");
    const five = health.find((row) => row.id === "5sim");
    assert.equal(geta?.health, "Configured but untested");
    assert.equal(five?.health, "Unsupported by provider");
    assert.equal(health.some((row) => row.health === "Working" && row.id === "getatext"), false);
  } finally {
    if (previous == null) delete process.env.GETATEXT_WEBHOOK_TOKEN;
    else process.env.GETATEXT_WEBHOOK_TOKEN = previous;
    await cleanup();
  }
});
