import assert from "node:assert/strict";
import test from "node:test";
import { getSql } from "@/lib/db";
import { answerVera, lastVeraTiming, previewVeraAnswer } from "@/lib/vera.server";
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

test("Vera uses Grok only when rollback is explicit", async () => {
  const prevKey = process.env.XAI_API_KEY;
  const prevModel = process.env.XAI_MODEL;
  const prevGemini = process.env.GEMINI_API_KEY;
  const prevProvider = process.env.VERA_PROVIDER;
  const prevFetch = globalThis.fetch;
  const sql = await getSql();
  try {
    process.env.XAI_API_KEY = "test-key-not-real";
    process.env.XAI_MODEL = "grok-4.5";
    process.env.VERA_PROVIDER = "xai";
    process.env.GEMINI_API_KEY = "should-not-be-used";
    let calls = 0;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls += 1;
      assert.equal(String(url), "https://api.x.ai/v1/chat/completions");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("authorization"), "Bearer test-key-not-real");
      const body = JSON.parse(String(init?.body || "{}")) as { model?: string; stream?: boolean; tools?: { function: { name: string } }[]; messages?: { role: string; content?: string }[] };
      assert.equal(body.model, "grok-4.5");
      assert.equal(JSON.stringify(body).includes("test-key-not-real"), false);
      assert.equal(JSON.stringify(body).includes("should-not-be-used"), false);
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
    if (prevGemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevGemini;
    if (prevProvider === undefined) delete process.env.VERA_PROVIDER;
    else process.env.VERA_PROVIDER = prevProvider;
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

test("Vera answers through free-tier Gemini without sending private account data", async () => {
  const prev = {
    xai: process.env.XAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL,
    provider: process.env.VERA_PROVIDER,
    fetch: globalThis.fetch,
  };
  const sql = await getSql();
  const chunks: string[] = [];
  try {
    process.env.XAI_API_KEY = "paid-key-must-not-be-used";
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.GEMINI_MODEL = "gemini-4-argon";
    delete process.env.VERA_PROVIDER;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("a wallet balance must be answered from the shop, not Gemini");
    }) as typeof fetch;

    const answered = await answerVera({
      question: "How much money do I have? My email is ada@example.com and password: hunter2",
      threadId: "",
      user: { id: `${token}-gemini`, role: "customer" },
      facts: "Signed-in balance: ₦4000. Name Ada.",
      faqs: [],
      telegram: "https://t.me/verilogs",
      welcome: "Hi",
      shop: { balance: 4000, name: "Ada", orders: [], txns: [{ userId: `${token}-gemini`, kind: "topup", amount: 4000, note: "Paystack", createdAt: "2026-11-28T00:00:00.000Z" }] },
    });
    assert.match(answered.text, /4,000/);
    assert.equal(answered.text.includes("ada@example.com"), false);
    assert.equal(answered.text.includes("hunter2"), false);
    assert.equal(calls, 0);
    assert.equal(lastVeraTiming()?.path, "private");
    assert.equal(lastVeraTiming()?.modelCalls, 0);
    const saved = await sql.query<{ body: string }>("select body from shop_vera_messages where thread_id = $1 order by created_at asc", [answered.threadId]);
    assert.equal(saved.length, 2);

    calls = 0;
    chunks.length = 0;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      calls += 1;
      const address = String(url);
      assert.equal(address.includes("api.x.ai"), false);
      assert.match(address, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.8-flash:streamGenerateContent/);
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("x-goog-api-key"), "gemini-test-key");
      const body = JSON.parse(String(init?.body || "{}")) as {
        contents?: { parts?: { text?: string }[] }[];
        tools?: unknown;
        generationConfig?: { temperature?: number; maxOutputTokens?: number; thinkingConfig?: { thinkingLevel?: string } };
      };
      const packed = JSON.stringify(body);
      assert.equal(body.tools, undefined);
      assert.equal(body.generationConfig?.temperature, undefined);
      assert.equal(body.generationConfig?.thinkingConfig?.thinkingLevel, "low");
      assert.equal(body.generationConfig?.maxOutputTokens, 1024);
      assert.match(packed, /How much money do I have/);
      assert.match(packed, /telegram/i);
      assert.equal(packed.includes("4000"), false);
      assert.equal(packed.includes("ada@example.com"), false);
      assert.equal(packed.includes("hunter2"), false);
      assert.equal(packed.includes("gemini-test-key"), false);
      return new Response(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "Telegram is listed in the current catalogue." }] } }] })}\n\n`, { status: 200 });
    }) as typeof fetch;
    const follow = await answerVera({
      question: "Is telegram in stock?",
      threadId: answered.threadId,
      user: { id: `${token}-gemini`, role: "customer" },
      facts: "Signed-in balance: ₦4000.",
      faqs: [],
      telegram: "https://t.me/verilogs",
      welcome: "Hi",
      shop: { balance: 4000, name: "Ada", orders: [], txns: [] },
      onDelta: (chunk) => chunks.push(chunk),
    });
    assert.match(follow.text, /Telegram/);
    assert.equal(chunks.join(""), follow.text);
    assert.equal(calls, 1);
    assert.equal(lastVeraTiming()?.path, "chat");
    assert.equal(lastVeraTiming()?.modelCalls, 1);
    const threadMessages = await sql.query<{ n: number }>("select count(*)::int as n from shop_vera_messages where thread_id = $1", [answered.threadId]);
    assert.equal(Number(threadMessages[0]?.n), 4);

    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), { status: 429 });
    }) as typeof fetch;
    const limited = await answerVera({
      question: `${token} what is a waiting number`,
      threadId: "",
      user: null,
      facts: "Not signed in.",
      faqs: [],
      telegram: "https://t.me/verilogs",
      welcome: "Hi",
    });
    assert.equal(limited.unanswered, true);
    assert.match(limited.text, /free assistant limit/);
    assert.equal(limited.text.includes("₦"), false);
    assert.equal(calls, 1);
    const kept = await sql.query<{ n: number }>("select count(*)::int as n from shop_vera_messages where thread_id = $1", [limited.threadId]);
    assert.equal(Number(kept[0]?.n), 2);

    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response("unavailable", { status: 503 });
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Server 1 is the FiveSim catalogue." }] } }],
      }), { status: 200 });
    }) as typeof fetch;
    const recovered = await answerVera({
      question: `${token} which catalogue is server 1`,
      threadId: "",
      user: null,
      facts: "Not signed in.",
      faqs: [],
      telegram: "https://t.me/verilogs",
      welcome: "Hi",
    });
    assert.match(recovered.text, /FiveSim/);
    assert.equal(calls, 2);

    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error("an administrator total is not sent to Gemini");
    }) as typeof fetch;
    const blocked = await answerVera({
      question: "What is today's revenue?",
      threadId: "",
      user: { id: `${token}-gemini`, role: "customer" },
      facts: "Signed-in balance: ₦4000.",
      faqs: [],
      telegram: "https://t.me/verilogs",
      welcome: "Hi",
      shop: { balance: 4000, name: "Ada", orders: [], txns: [] },
    });
    assert.match(blocked.text, /not available on this account/i);
    assert.equal(blocked.text.includes("4000"), false);
    assert.equal(calls, 0);
    const previewCalls = calls;
    const preview = await previewVeraAnswer("Why is my money not showing?");
    assert.match(preview.text, /wallet|Paystack/i);
    assert.equal(calls, previewCalls);
  } finally {
    if (prev.xai === undefined) delete process.env.XAI_API_KEY;
    else process.env.XAI_API_KEY = prev.xai;
    if (prev.gemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prev.gemini;
    if (prev.model === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = prev.model;
    if (prev.provider === undefined) delete process.env.VERA_PROVIDER;
    else process.env.VERA_PROVIDER = prev.provider;
    globalThis.fetch = prev.fetch;
    const talked = await sql.query<{ thread_id: string }>("select distinct thread_id from shop_vera_messages where body like $1 or thread_id in (select thread_id from shop_vera_messages where body like $2)", [`%${token}%`, "%How much money%"]);
    const ids = [...new Set(talked.map((row) => row.thread_id))];
    for (const id of ids) {
      await sql.query("delete from shop_vera_messages where thread_id = $1", [id]);
      await sql.query("delete from shop_vera_threads where id = $1", [id]);
    }
    await sql.query("delete from shop_vera_unanswered where question like $1", [`%${token}%`]);
  }
});

test("Vera shows the first Gemini token before the rest of the answer", async () => {
  const prev = { gemini: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL, provider: process.env.VERA_PROVIDER, fetch: globalThis.fetch };
  const sql = await getSql();
  const rows: string[] = [];
  try {
    process.env.GEMINI_API_KEY = "gemini-test-key";
    process.env.GEMINI_MODEL = "gemini-3.8-flash";
    delete process.env.VERA_PROVIDER;
    const shop: VeraShop = {
      balance: 2500,
      name: "Ada",
      orders: [{ id: "ord-1", userId: `${token}-speed`, title: "WhatsApp UK", category: "number", status: "waiting", amount: 800, createdAt: "2026-11-28T03:00:00.000Z", code: "445566", phone: "+447700900111" }],
      txns: [],
    };
    const actor = { id: `${token}-speed`, role: "customer" as const };
    globalThis.fetch = (async () => {
      throw new Error("order lookup must not call Gemini");
    }) as typeof fetch;
    const orderStarted = performance.now();
    const order = await answerVera({
      question: "What is the status of my last order?",
      threadId: "",
      user: actor,
      facts: "Signed-in balance: ₦2500.",
      faqs: [],
      telegram: "https://t.me/verilogs",
      welcome: "Hi",
      shop,
    });
    const orderTiming = lastVeraTiming();
    assert.match(order.text, /WhatsApp UK/);
    assert.equal(orderTiming?.path, "private");
    assert.equal(orderTiming?.modelCalls, 0);
    rows.push(`order first=${orderTiming?.firstVisibleMs}ms total=${Math.round(performance.now() - orderStarted)}ms calls=0`);

    let release: () => void = () => {};
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}")) as { tools?: unknown; generationConfig?: { maxOutputTokens?: number; thinkingConfig?: { thinkingLevel?: string } } };
      assert.equal(body.tools, undefined);
      assert.equal(body.generationConfig?.thinkingConfig?.thinkingLevel, "low");
      assert.equal(body.generationConfig?.maxOutputTokens, 512);
      const stream = new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder();
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "Hello" }] } }] })}\n\n`));
          await hold;
          controller.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: " from Vera." }] } }] })}\n\n`));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    }) as typeof fetch;
    let firstAt = 0;
    const greetStarted = performance.now();
    const pending = answerVera({
      question: "Hello",
      threadId: "",
      user: null,
      facts: "Not signed in.",
      faqs: [],
      telegram: "https://t.me/verilogs",
      welcome: "Hi",
      onDelta: () => {
        if (!firstAt) firstAt = performance.now();
      },
    });
    const deadline = Date.now() + 4000;
    while (!firstAt && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
    assert.ok(firstAt > 0, "the first token was held until Gemini finished");
    const firstWait = firstAt - greetStarted;
    await new Promise((r) => setTimeout(r, 80));
    release();
    const greeted = await pending;
    const greetTotal = performance.now() - greetStarted;
    assert.match(greeted.text, /Hello from Vera/);
    assert.ok(greetTotal > firstWait + 50, `first token ${Math.round(firstWait)}ms was not ahead of total ${Math.round(greetTotal)}ms`);
    const greetTiming = lastVeraTiming();
    assert.equal(greetTiming?.path, "brief");
    rows.push(`greeting first=${Math.round(firstWait)}ms total=${Math.round(greetTotal)}ms prep=${greetTiming?.prepMs}ms gemini=${greetTiming?.geminiWaitMs}ms`);

    globalThis.fetch = (async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || "{}")) as { tools?: { functionDeclarations?: { name: string }[] }[]; generationConfig?: { thinkingConfig?: { thinkingLevel?: string }; maxOutputTokens?: number } };
      assert.equal(body.generationConfig?.thinkingConfig?.thinkingLevel, "medium");
      assert.equal(body.generationConfig?.maxOutputTokens, 2048);
      assert.equal(body.tools?.[0]?.functionDeclarations?.some((tool) => tool.name === "search_catalogue"), true);
      assert.equal(body.tools?.[0]?.functionDeclarations?.some((tool) => tool.name === "admin_overview"), false);
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Server 1 is FiveSim and Server 2 is a separate catalogue, so a service on one is not automatically on the other." }] } }],
      }), { status: 200 });
    }) as typeof fetch;
    const deepStarted = performance.now();
    const deep = await answerVera({
      question: "Compare Server 1 and Server 2 step by step and explain why a number stocked on one server is not automatically available on the other.",
      threadId: "",
      user: null,
      facts: "Not signed in.",
      faqs: [],
      telegram: "https://t.me/verilogs",
      welcome: "Hi",
    });
    assert.match(deep.text, /FiveSim/);
    assert.equal(lastVeraTiming()?.path, "deep");
    rows.push(`deep first=${lastVeraTiming()?.firstVisibleMs}ms total=${Math.round(performance.now() - deepStarted)}ms calls=${lastVeraTiming()?.modelCalls}`);
    console.log(rows.join("\n"));
  } finally {
    if (prev.gemini === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prev.gemini;
    if (prev.model === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = prev.model;
    if (prev.provider === undefined) delete process.env.VERA_PROVIDER;
    else process.env.VERA_PROVIDER = prev.provider;
    globalThis.fetch = prev.fetch;
    const talked = await sql.query<{ thread_id: string }>("select distinct thread_id from shop_vera_messages where body like $1 or body like $2 or body like $3", [`%${token}-speed%`, "%Hello from Vera%", "%Compare Server 1%"]);
    for (const row of talked) {
      await sql.query("delete from shop_vera_messages where thread_id = $1", [row.thread_id]);
      await sql.query("delete from shop_vera_threads where id = $1", [row.thread_id]);
    }
    await sql.query("delete from shop_vera_messages where body like $1", ["%FiveSim and Server 2%"]);
    await sql.query("delete from shop_vera_unanswered where question like $1", ["%Compare Server 1%"]);
  }
});


