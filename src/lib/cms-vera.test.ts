import assert from "node:assert/strict";
import test from "node:test";
import { getSql } from "@/lib/db";
import { adminPage, publishPage, publishedPage, restorePageVersion, savePageDraft } from "@/lib/site-content.server";
import { pageDefaults, sanitizeHtml, visiblePage } from "@/lib/site-pages";
import { answerVera, deleteOldVeraThreads, previewVeraAnswer, recordVeraFeedback, suggestVeraKnowledge, veraAnalytics } from "@/lib/vera.server";
import { localVeraReply, questionKey, retrieveKnowledge, VERA_SEED } from "@/lib/vera-mind";

const token = "zxqveramooncheese";

test("public pages hide drafts and admin notes until publish", () => {
  const dirty = sanitizeHtml('<p onclick="steal()">Hello</p><script>alert(1)</script><a href="javascript:alert(1)">x</a>');
  assert.equal(dirty.includes("script"), false);
  assert.equal(dirty.includes("onclick"), false);
  assert.equal(dirty.includes("javascript"), false);
  assert.match(dirty, /<p>Hello<\/p>/);

  const hidden = visiblePage({ title: "Terms", publicHtml: "<p>PRIVATE-NOTE-SHOULD-NOT-LEAK</p>", published: false }, "terms");
  assert.equal(hidden.source, "built-in");
  assert.equal(hidden.html.includes("PRIVATE-NOTE"), false);
  assert.equal(hidden.html, pageDefaults("terms").html);

  const live = visiblePage({ title: "Terms", publicHtml: "<p>Live terms</p>", published: true }, "terms");
  assert.equal(live.source, "published");
  assert.match(live.html, /Live terms/);
  assert.equal(visiblePage({ title: "Terms", publicHtml: "", published: true }, "terms").source, "built-in");
});

test("Vera understands wallet trouble, typos, follow-ups and escalation", () => {
  const money = localVeraReply({
    question: "Why is my money not showing?",
    history: [],
    knowledge: VERA_SEED,
    facts: "Signed in. No wallet credit is recorded.",
    telegram: "https://t.me/verilogs",
    welcome: "Hi",
  });
  assert.match(money.text, /wallet|Paystack/i);
  assert.equal(money.unanswered, false);

  const hits = retrieveKnowledge(VERA_SEED, "is watsapp available on server 1", 4);
  assert.ok(hits.some((hit) => /whatsapp|server 1|fivesim/i.test(`${hit.title} ${hit.body}`)));

  const follow = localVeraReply({
    question: "Server 1",
    history: [
      { role: "customer", body: "I purchased a number" },
      { role: "vera", body: "Which server did you use?" },
    ],
    knowledge: VERA_SEED,
    facts: "",
    telegram: "https://t.me/verilogs",
    welcome: "Hi",
  });
  assert.match(follow.text, /Server 1|FiveSim|number/i);
  assert.equal(follow.unanswered, false);

  const person = localVeraReply({
    question: "I need a person, this payment is a dispute",
    history: [],
    knowledge: VERA_SEED,
    facts: "",
    telegram: "https://t.me/verilogs",
    welcome: "Hi",
  });
  assert.equal(person.escalate, true);
  assert.match(person.text, /t\.me\/verilogs/);

  assert.equal(questionKey("How do I fund my wallet?"), questionKey("how do i fund wallet"));
});

test("publishing, Vera history and analytics use the real rows", async () => {
  delete process.env.XAI_API_KEY;
  const sql = await getSql();
  const before = await adminPage("notices");
  assert.ok(before);
  const prior = await sql.query<{ id: string }>("select id from shop_page_versions where slug = 'notices'");
  const keep = prior.map((row) => row.id);
  const started = Number((await sql.query<{ n: number }>("select count(*)::int as n from shop_vera_threads"))[0]?.n) || 0;
  try {
    const draft = await savePageDraft({ slug: "notices", title: "Website notices", draftHtml: `<p>${token}-draft</p>`, adminNote: `${token}-note` }, "cms-test");
    assert.equal(draft.error, null);
    const hidden = await publishedPage("notices");
    assert.ok(hidden);
    assert.equal(JSON.stringify(hidden).includes(`${token}-note`), false);
    assert.equal(hidden.html.includes(`${token}-draft`), false);
    const admin = await adminPage("notices");
    assert.match(admin?.adminNote || "", new RegExp(`${token}-note`));

    assert.equal((await publishPage("notices", "cms-test")).error, null);
    const live = await publishedPage("notices");
    assert.equal(live?.source, "published");
    assert.match(live?.html || "", new RegExp(`${token}-draft`));

    await savePageDraft({ slug: "notices", title: "Website notices", draftHtml: `<p>${token}-second</p>`, adminNote: `${token}-note` }, "cms-test");
    await publishPage("notices", "cms-test");
    const versions = await sql.query<{ id: string }>("select id from shop_page_versions where slug = 'notices' and kind = 'publish' and html like $1 order by created_at asc", [`%${token}-draft%`]);
    assert.ok(versions[0]);
    assert.equal((await restorePageVersion(versions[0].id, "cms-test")).error, null);
    const restored = await publishedPage("notices");
    assert.match(restored?.html || "", new RegExp(`${token}-draft`));
    assert.equal((restored?.html || "").includes(`${token}-second`), false);

    const first = await answerVera({
      question: `${token} why is the moon made of cheese`,
      threadId: "",
      user: null,
      facts: "Not signed in. No wallet credit is recorded.",
      faqs: [],
      telegram: "https://t.me/verilogs",
      welcome: "Hi",
    });
    assert.equal(first.unanswered, true);
    const status = await sql.query<{ status: string }>("select status from shop_vera_threads where id = $1", [first.threadId]);
    assert.notEqual(status[0]?.status, "resolved");

    await answerVera({
      question: "Server 1",
      threadId: first.threadId,
      user: null,
      facts: "Not signed in. No wallet credit is recorded.",
      faqs: [],
      telegram: "https://t.me/verilogs",
      welcome: "Hi",
    });
    const messages = await sql.query<{ n: number }>("select count(*)::int as n from shop_vera_messages where thread_id = $1", [first.threadId]);
    assert.equal(Number(messages[0]?.n), 4);

    const previewThreads = Number((await sql.query<{ n: number }>("select count(*)::int as n from shop_vera_threads"))[0]?.n);
    const preview = await previewVeraAnswer("Why is my money not showing?");
    assert.match(preview.text, /wallet|Paystack/i);
    const afterPreview = Number((await sql.query<{ n: number }>("select count(*)::int as n from shop_vera_threads"))[0]?.n);
    assert.equal(afterPreview, previewThreads);

    assert.equal((await recordVeraFeedback({ threadId: first.threadId, userId: "", helpful: "yes", comment: "clear" })).error, null);
    const resolved = await sql.query<{ status: string }>("select status from shop_vera_threads where id = $1", [first.threadId]);
    assert.equal(resolved[0]?.status, "resolved");

    const report = await veraAnalytics({});
    const counted = await sql.query<{ threads: number; messages: number; resolved: number; open: number }>(
      `select
         (select count(*)::int from shop_vera_threads) as threads,
         (select count(*)::int from shop_vera_messages where role = 'customer') as messages,
         (select count(*)::int from shop_vera_threads where status = 'resolved') as resolved,
         (select count(*)::int from shop_vera_unanswered where addressed = false) as open`,
    );
    assert.equal(report.totals.conversations, Number(counted[0]?.threads));
    assert.equal(report.totals.messages, Number(counted[0]?.messages));
    assert.equal(report.totals.resolved, Number(counted[0]?.resolved));
    assert.equal(report.totals.unanswered, Number(counted[0]?.open));
    assert.ok(report.totals.conversations >= started + 1);

    const found = await veraAnalytics({ q: token, status: "resolved" });
    assert.ok(found.threads.some((thread) => thread.id === first.threadId));
    const missed = await veraAnalytics({ q: token, status: "active" });
    assert.equal(missed.threads.some((thread) => thread.id === first.threadId), false);

    const suggestion = await suggestVeraKnowledge(`${token} suggestion`, "cms-test");
    assert.equal(suggestion.error, null);
    const suggested = await sql.query<{ enabled: boolean }>("select enabled from shop_vera_knowledge where id = $1", [suggestion.id]);
    assert.equal(suggested[0]?.enabled, false);

    const old = new Date(Date.now() - 120 * 86400000).toISOString();
    await sql.query(
      "insert into shop_vera_threads (id, user_id, status, helpful, comment, escalated, started_at, updated_at) values ($1, '', 'active', '', '', false, $2, $2)",
      [`${token}-active`, old],
    );
    await sql.query(
      "insert into shop_vera_threads (id, user_id, status, helpful, comment, escalated, started_at, updated_at) values ($1, '', 'abandoned', '', '', false, $2, $2)",
      [`${token}-old`, old],
    );
    await deleteOldVeraThreads(90, "cms-test");
    const kept = await sql.query<{ id: string }>("select id from shop_vera_threads where id = $1", [`${token}-active`]);
    const dropped = await sql.query<{ id: string }>("select id from shop_vera_threads where id = $1", [`${token}-old`]);
    assert.equal(kept.length, 1);
    assert.equal(dropped.length, 0);
  } finally {
    if (before) {
      await sql.query(
        "update shop_pages set title = $2, draft_html = $3, public_html = $4, published = $5, admin_note = $6, updated_at = $7, updated_by = $8 where slug = $1",
        [before.slug, before.title, before.draftHtml, before.publicHtml, before.published, before.adminNote, before.updatedAt, before.updatedBy],
      );
    }
    const current = await sql.query<{ id: string }>("select id from shop_page_versions where slug = 'notices'");
    for (const row of current) {
      if (!keep.includes(row.id)) await sql.query("delete from shop_page_versions where id = $1", [row.id]);
    }
    const talked = await sql.query<{ thread_id: string }>("select distinct thread_id from shop_vera_messages where body like $1", [`%${token}%`]);
    const ids = [...new Set([...talked.map((row) => row.thread_id), `${token}-active`, `${token}-old`])];
    for (const id of ids) {
      await sql.query("delete from shop_vera_messages where thread_id = $1", [id]);
      await sql.query("delete from shop_vera_threads where id = $1", [id]);
    }
    await sql.query("delete from shop_vera_unanswered where question like $1", [`%${token}%`]);
    await sql.query("delete from shop_vera_unanswered where norm like $1", [`%${token}%`]);
    await sql.query("delete from shop_vera_knowledge where title like $1", [`%${token}%`]);
    await sql.query("delete from shop_admin_log where admin_id = $1", ["cms-test"]);
  }
});
