import assert from "node:assert/strict";
import test from "node:test";
import { getSql } from "@/lib/db";
import { answerVera, previewVeraAnswer } from "@/lib/vera.server";
import { runVeraTool, veraToolAllowed, type VeraShop } from "@/lib/vera-tools.server";

const token = "zxqveratools";

test("Vera tools follow the signed-in role and hide other people's deliveries", async () => {
  assert.equal(veraToolAllowed("my_orders", "guest"), false);
  assert.equal(veraToolAllowed("admin_overview", "customer"), false);
  assert.equal(veraToolAllowed("admin_overview", "admin"), true);
  assert.equal(veraToolAllowed("search_catalogue", "guest"), true);

  const denied = JSON.parse(await runVeraTool("my_orders", {}, null));
  assert.match(denied.error, /Not available/);
  const spoofed = JSON.parse(await runVeraTool("admin_overview", { role: "admin" }, { id: "u1", role: "customer" }));
  assert.match(spoofed.error, /Not available/);

  const shop: VeraShop = {
    balance: 4000,
    name: "Ada",
    orders: [
      { id: "mine", userId: "u1", title: "Telegram UK", category: "number", status: "waiting", amount: 500, createdAt: "2026-11-28T01:00:00.000Z", code: "123456789012345", phone: "+447700900123" },
      { id: "other", userId: "u2", title: "Secret other", category: "logs", status: "completed", amount: 9000, createdAt: "2026-11-28T02:00:00.000Z", delivery: "cookie=secret", code: "LEAK" },
    ],
    txns: [{ userId: "u1", kind: "topup", amount: 4000, note: "Paystack success", createdAt: "2026-11-28T00:30:00.000Z" }],
  };
  const snap = JSON.parse(await runVeraTool("account_snapshot", {}, { id: "u1", role: "customer" }, shop));
  assert.equal(snap.balance, 4000);
  assert.equal(snap.recent[0].amount, 4000);
  const orders = JSON.parse(await runVeraTool("my_orders", {}, { id: "u1", role: "customer" }, shop));
  assert.deepEqual(orders.orders.map((order: { id: string }) => order.id), ["mine"]);
  assert.equal(orders.orders[0].code, "123456789012");
  const dumped = JSON.stringify(orders);
  assert.equal(dumped.includes("Secret"), false);
  assert.equal(dumped.includes("cookie"), false);
  assert.equal(dumped.includes("LEAK"), false);
  const foreign = JSON.parse(await runVeraTool("order_status", { orderId: "other" }, { id: "u1", role: "admin" }, shop));
  assert.match(foreign.error, /No matching order/);
});

test("Vera catalogue, deposits and admin totals come from the database", async () => {
  const sql = await getSql();
  const before = await sql.query<{ doc: string }>("select doc from shop_state where id = 'main'");
  const doc = JSON.stringify({
    users: [{ id: `${token}-user`, name: "Ada", email: `${token}@example.com`, role: "customer", createdAt: new Date().toISOString(), balance: 1 }],
    orders: [{ id: `${token}-order`, userId: `${token}-user`, title: "Telegram UK", status: "completed", amount: 500, gain: 80, createdAt: new Date().toISOString(), category: "number" }],
    txns: [],
  });
  try {
    await sql.query(
      `insert into shop_products (id, provider_id, external_id, category, name, service, country, price, cost, stock, enabled, server_id)
       values ($1, 'vt-prov', 'vt-ext', 'number', 'Telegram United Kingdom', 'telegram', 'United Kingdom', 450, 100, 4, true, '1'),
              ($2, 'vt-prov', 'vt-hidden', 'number', 'Hidden Telegram', 'telegram', 'United Kingdom', 450, 100, 9, false, '1')`,
      [`${token}-tg`, `${token}-hidden`],
    );
    await sql.query(
      `insert into shop_deposits (reference, user_id, credit, status, paystack_status, updated_at)
       values ($1, $2, 4000, 'needs_reconciliation', 'success', now()),
              ($3, $2, 2000, 'credited', 'success', now()),
              ($4, 'someone-else', 9000, 'credited', 'success', now())`,
      [`${token}-recon`, `${token}-user`, `${token}-ok`, `${token}-other`],
    );
    await sql.query("insert into shop_state (id, doc) values ('main', $1) on conflict (id) do update set doc = $1", [doc]);

    const found = JSON.parse(await runVeraTool("search_catalogue", { query: "telegram", area: "numbers" }, null));
    assert.equal(found.items.some((item: { name: string }) => item.name === "Telegram United Kingdom"), true);
    assert.equal(found.items.some((item: { name: string }) => item.name === "Hidden Telegram"), false);
    assert.equal(JSON.stringify(found).includes("\"cost\""), false);
    assert.equal(found.items.find((item: { name: string }) => item.name === "Telegram United Kingdom").price, 450);

    const airtime = JSON.parse(await runVeraTool("search_catalogue", { query: "MTN", area: "airtime" }, null));
    assert.match(airtime.note, /not open/i);
    assert.equal(airtime.items.some((item: { name: string }) => item.name === "MTN"), true);

    const deposits = JSON.parse(await runVeraTool("my_deposits", {}, { id: `${token}-user`, role: "customer" }));
    const refs = deposits.deposits.map((row: { reference: string }) => row.reference);
    assert.ok(refs.includes(`${token}-recon`));
    assert.ok(refs.includes(`${token}-ok`));
    assert.equal(refs.includes(`${token}-other`), false);

    const overview = JSON.parse(await runVeraTool("admin_overview", {}, { id: "admin", role: "admin" }));
    assert.equal(overview.customers.total, 1);
    assert.equal(overview.completedOrders, 1);
    assert.equal(overview.revenueToday, 500);
    assert.equal(overview.profitToday, 80);
    assert.ok(overview.depositsNeedingReconciliation >= 1);
    assert.equal(JSON.stringify(overview).includes("@"), false);
  } finally {
    await sql.query("delete from shop_products where id like $1", [`${token}%`]);
    await sql.query("delete from shop_deposits where reference like $1", [`${token}%`]);
    if (before[0]) await sql.query("update shop_state set doc = $1 where id = 'main'", [before[0].doc]);
    else await sql.query("delete from shop_state where id = 'main'");
  }
});

test("Vera uses Grok tool results and falls back without calling preview", async () => {
  const prevKey = process.env.XAI_API_KEY;
  const prevModel = process.env.XAI_MODEL;
  const prevFetch = globalThis.fetch;
  const sql = await getSql();
  try {
    process.env.XAI_API_KEY = "test-key-not-real";
    process.env.XAI_MODEL = "grok-4.5";
    let calls = 0;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls += 1;
      assert.equal(String(url), "https://api.x.ai/v1/chat/completions");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer test-key-not-real");
      const body = JSON.parse(String(init?.body || "{}")) as { model?: string; stream?: boolean; tools?: { function: { name: string } }[]; messages?: { role: string; content?: string }[] };
      assert.equal(body.model, "grok-4.5");
      assert.equal(JSON.stringify(body).includes("test-key-not-real"), false);
      if (calls === 1) {
        assert.equal(body.tools?.some((tool) => tool.function.name === "admin_overview"), false);
        assert.equal(body.tools?.some((tool) => tool.function.name === "account_snapshot"), true);
        return new Response(JSON.stringify({
          choices: [{ message: { content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "account_snapshot", arguments: "{}" } }] } }],
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      const tool = body.messages?.find((message) => message.role === "tool");
      assert.match(tool?.content || "", /4000/);
      return new Response(JSON.stringify({ choices: [{ message: { content: "Your balance is ₦4,000." } }] }), { status: 200 });
    }) as typeof fetch;

    const answered = await answerVera({
      question: "How much money do I have?",
      threadId: "",
      user: { id: `${token}-chat`, role: "customer" },
      facts: "Signed-in balance: ₦4000.",
      faqs: [],
      telegram: "https://t.me/verilogs",
      welcome: "Hi",
      shop: { balance: 4000, name: "Ada", orders: [], txns: [] },
    });
    assert.match(answered.text, /4,000|4000/);
    assert.equal(calls, 2);

    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("timeout");
    }) as typeof fetch;
    const failed = await answerVera({
      question: `${token} why is the moon made of cheese`,
      threadId: "",
      user: null,
      facts: "Not signed in.",
      faqs: [],
      telegram: "https://t.me/verilogs",
      welcome: "Hi",
    });
    assert.equal(failed.unanswered, true);
    assert.equal(calls, 1);

    calls = 0;
    const preview = await previewVeraAnswer("Why is my money not showing?");
    assert.match(preview.text, /wallet|Paystack/i);
    assert.equal(calls, 0);
  } finally {
    if (prevKey === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = prevKey;
    if (prevModel === undefined) delete process.env.XAI_MODEL;
    else process.env.XAI_MODEL = prevModel;
    globalThis.fetch = prevFetch;
    const talked = await sql.query<{ thread_id: string }>("select distinct thread_id from shop_vera_messages where body like $1", [`%${token}%`]);
    const ids = [...new Set(talked.map((row) => row.thread_id))];
    for (const id of ids) {
      await sql.query("delete from shop_vera_messages where thread_id = $1", [id]);
      await sql.query("delete from shop_vera_threads where id = $1", [id]);
    }
    await sql.query("delete from shop_vera_messages where body = $1", ["How much money do I have?"]);
    await sql.query("delete from shop_vera_messages where body like $1", ["%balance is%"]);
    const loose = await sql.query<{ thread_id: string }>("select distinct thread_id from shop_vera_messages where body = $1 or body like $2", ["How much money do I have?", "%Your balance is%"]);
    for (const row of loose) {
      await sql.query("delete from shop_vera_messages where thread_id = $1", [row.thread_id]);
      await sql.query("delete from shop_vera_threads where id = $1", [row.thread_id]);
    }
    await sql.query("delete from shop_vera_unanswered where question like $1", [`%${token}%`]);
  }
});
