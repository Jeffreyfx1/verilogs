import { getSql } from "@/lib/db";
import { uid } from "@/lib/money";
import {
  localVeraReply,
  questionKey,
  retrieveKnowledge,
  stripUnanswered,
  VERA_CATEGORIES,
  VERA_SEED,
  wantsEscalation,
} from "@/lib/vera-mind";

type KnowledgeRow = { id: string; category: string; title: string; body: string; enabled: boolean; updated_at: string; updated_by: string };

async function logAdmin(adminId: string, action: string, target: string) {
  const sql = await getSql();
  await sql.query("insert into shop_admin_log (id, admin_id, action, target, created_at) values ($1, $2, $3, $4, $5)", [
    uid("log"),
    adminId,
    action.slice(0, 80),
    target.slice(0, 180),
    new Date().toISOString(),
  ]);
}

export async function ensureVeraKnowledge() {
  const sql = await getSql();
  for (const item of VERA_SEED) {
    await sql.query(
      `insert into shop_vera_knowledge (id, category, title, body, enabled, updated_at, updated_by)
       values ($1, $2, $3, $4, true, $5, 'system')
       on conflict (id) do nothing`,
      [item.id, item.category, item.title, item.body, new Date().toISOString()],
    );
  }
}

export async function answerVera(input: {
  question: string;
  threadId: string;
  user: { id: string } | null;
  facts: string;
  faqs: { question: string; answer: string }[];
  telegram: string;
  welcome: string;
}) {
  await ensureVeraKnowledge();
  const sql = await getSql();
  let threadId = input.threadId.trim();
  let history: { role: string; body: string }[] = [];
  if (threadId) {
    const threads = await sql.query<{ id: string; user_id: string }>("select id, user_id from shop_vera_threads where id = $1", [threadId]);
    const thread = threads[0];
    const allowed = !!thread && (!thread.user_id || !input.user || thread.user_id === input.user.id);
    if (!allowed) threadId = "";
    else {
      history = await sql.query<{ role: string; body: string }>("select role, body from shop_vera_messages where thread_id = $1 order by created_at asc limit 12", [threadId]);
    }
  }
  const now = new Date().toISOString();
  if (!threadId) {
    threadId = uid("vera");
    await sql.query(
      "insert into shop_vera_threads (id, user_id, status, helpful, comment, escalated, started_at, updated_at) values ($1, $2, 'active', '', '', false, $3, $3)",
      [threadId, input.user?.id || "", now],
    );
  }
  const knowledge = await sql.query<{ title: string; body: string; category: string }>("select title, body, category from shop_vera_knowledge where enabled = true");
  const pool = [...knowledge, ...input.faqs.map((faq) => ({ title: faq.question, body: faq.answer, category: "FAQ" }))];
  const hits = retrieveKnowledge(pool, `${history.map((line) => line.body).join(" ")} ${input.question}`, 4);
  const local = localVeraReply({
    question: input.question,
    history,
    knowledge: hits,
    facts: input.facts,
    telegram: input.telegram,
    welcome: input.welcome,
  });
  let text = local.text;
  let unanswered = local.unanswered;
  const escalate = local.escalate || wantsEscalation(input.question);
  const apiKey = process.env.XAI_API_KEY;
  if (apiKey) {
    try {
      const prior = history.slice(-8).map((line) => ({ role: line.role === "customer" ? "user" : "assistant", content: line.body.slice(0, 600) }));
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "grok-4.5",
          max_tokens: 420,
          messages: [
            {
              role: "system",
              content: "You are Vera, VeriLogs support. Understand normal English, Nigerian English, short replies and typos. Use only FACTS and KNOWLEDGE for balances, prices, stock, orders and refunds. Never invent a payment, a service, a price or a refund. Server 1 is FiveSim. Server 2 and Server 3 are different. Ask one follow-up question when a country, server or order is missing. If FACTS and KNOWLEDGE do not answer, start with [[UNANSWERED]] and send the customer to Telegram. Keep the reply under 120 words.",
            },
            ...prior,
            {
              role: "user",
              content: `FACTS:\n${input.facts.slice(0, 1800)}\n\nKNOWLEDGE:\n${hits.map((hit) => `${hit.title}: ${hit.body}`).join("\n").slice(0, 2200)}\n\nCUSTOMER:\n${input.question}`,
            },
          ],
        }),
      });
      if (res.ok) {
        const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const spoken = stripUnanswered(body.choices?.[0]?.message?.content?.trim() || "");
        if (spoken.text) {
          text = spoken.text;
          unanswered = spoken.unanswered;
        }
      }
    } catch {
      text = local.text;
    }
  }
  await sql.query("insert into shop_vera_messages (id, thread_id, role, body, created_at) values ($1, $2, 'customer', $3, $4)", [uid("vmsg"), threadId, input.question.slice(0, 500), now]);
  await sql.query("insert into shop_vera_messages (id, thread_id, role, body, created_at) values ($1, $2, 'vera', $3, $4)", [uid("vmsg"), threadId, text.slice(0, 2000), now]);
  if (unanswered) {
    const norm = questionKey(input.question).slice(0, 180) || foldSafe(input.question);
    const context = history.slice(-2).map((line) => `${line.role}: ${line.body}`).join("\n").slice(0, 500);
    await sql.query(
      `insert into shop_vera_unanswered (id, question, norm, context, times, addressed, created_at, updated_at)
       values ($1, $2, $3, $4, 1, false, $5, $5)
       on conflict (norm) do update set times = shop_vera_unanswered.times + 1, updated_at = $5, context = $4`,
      [uid("unq"), input.question.slice(0, 500), norm, context, now],
    );
  }
  await sql.query(
    "update shop_vera_threads set status = $2, escalated = escalated or $3, updated_at = $4 where id = $1",
    [threadId, escalate ? "escalated" : "active", escalate, now],
  );
  return { text, threadId, escalated: escalate, unanswered };
}

function foldSafe(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 180) || "question";
}

export async function previewVeraAnswer(question: string) {
  const q = question.trim().slice(0, 500);
  if (!q) return { error: "Type a question first.", text: "", unanswered: false, escalated: false, used: [] as string[] };
  await ensureVeraKnowledge();
  const sql = await getSql();
  const knowledge = await sql.query<{ title: string; body: string; category: string }>("select title, body, category from shop_vera_knowledge where enabled = true");
  const hits = retrieveKnowledge(knowledge, q, 4);
  const local = localVeraReply({
    question: q,
    history: [],
    knowledge: hits,
    facts: "Preview only. No customer account is attached, so balances and orders are not looked up.",
    telegram: "the Telegram channel",
    welcome: "Vera preview.",
  });
  return { error: null as string | null, text: local.text, unanswered: local.unanswered, escalated: local.escalate, used: hits.map((hit) => hit.title) };
}

export async function recordVeraFeedback(input: { threadId: string; userId: string; helpful: "yes" | "no"; comment: string }) {
  const sql = await getSql();
  const rows = await sql.query<{ user_id: string; status: string }>("select user_id, status from shop_vera_threads where id = $1", [input.threadId]);
  const thread = rows[0];
  if (!thread) return { error: "Conversation not found." };
  if (thread.user_id && input.userId && thread.user_id !== input.userId) return { error: "That conversation is not on this account." };
  const helpful = input.helpful === "yes" ? "yes" : "no";
  const status = helpful === "yes" ? "resolved" : thread.status === "escalated" ? "escalated" : "active";
  await sql.query("update shop_vera_threads set helpful = $2, comment = $3, status = $4, updated_at = $5 where id = $1", [
    input.threadId,
    helpful,
    input.comment.slice(0, 400),
    status,
    new Date().toISOString(),
  ]);
  return { error: null as string | null };
}

export async function listVeraKnowledge() {
  await ensureVeraKnowledge();
  const sql = await getSql();
  return sql.query<KnowledgeRow>("select id, category, title, body, enabled, updated_at, updated_by from shop_vera_knowledge order by category, title");
}

export async function saveVeraKnowledge(input: { id?: string; category: string; title: string; body: string; enabled: boolean }, actor: string) {
  const category = VERA_CATEGORIES.includes(input.category as (typeof VERA_CATEGORIES)[number]) ? input.category : VERA_CATEGORIES[0];
  const title = input.title.trim().slice(0, 140);
  const body = input.body.trim().slice(0, 4000);
  if (!title || !body) return { error: "Write a title and the information Vera should use." };
  const sql = await getSql();
  const id = input.id || uid("vk");
  const now = new Date().toISOString();
  await sql.query(
    `insert into shop_vera_knowledge (id, category, title, body, enabled, updated_at, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (id) do update set category = $2, title = $3, body = $4, enabled = $5, updated_at = $6, updated_by = $7`,
    [id, category, title, body, !!input.enabled, now, actor],
  );
  await logAdmin(actor, "save vera knowledge", id);
  return { error: null as string | null, id };
}

export async function removeVeraKnowledge(id: string, actor: string) {
  if (VERA_SEED.some((item) => item.id === id)) return { error: "That built-in article can be edited or turned off, not removed." };
  const sql = await getSql();
  await sql.query("delete from shop_vera_knowledge where id = $1", [id]);
  await logAdmin(actor, "delete vera knowledge", id);
  return { error: null as string | null };
}

export async function veraAnalytics(filter: { q?: string; status?: string; from?: string; to?: string }) {
  const sql = await getSql();
  const threads = await sql.query<{
    id: string;
    user_id: string;
    status: string;
    helpful: string;
    comment: string;
    escalated: boolean;
    started_at: string;
    updated_at: string;
  }>("select id, user_id, status, helpful, comment, escalated, started_at, updated_at from shop_vera_threads order by updated_at desc limit 300");
  const messages = await sql.query<{ id: string; thread_id: string; role: string; body: string; created_at: string }>(
    "select id, thread_id, role, body, created_at from shop_vera_messages order by created_at desc limit 800",
  );
  const unanswered = await sql.query<{ id: string; question: string; context: string; times: number; addressed: boolean; created_at: string; updated_at: string }>(
    "select id, question, context, times, addressed, created_at, updated_at from shop_vera_unanswered order by times desc, updated_at desc limit 100",
  );
  const from = Date.parse(filter.from || "") || 0;
  const to = Date.parse(filter.to || "") || 0;
  const q = (filter.q || "").trim().toLowerCase();
  const wanted = filter.status || "";
  const scoped = threads.filter((thread) => {
    const at = Date.parse(thread.updated_at || thread.started_at || "") || 0;
    if (from && at < from) return false;
    if (to && at > to + 86400000) return false;
    if (wanted === "resolved" && thread.status !== "resolved") return false;
    if (wanted === "unresolved" && thread.status === "resolved") return false;
    if (wanted === "escalated" && !thread.escalated && thread.status !== "escalated") return false;
    if (wanted === "unanswered" && !unanswered.some((item) => !item.addressed && messages.some((message) => message.thread_id === thread.id && message.role === "customer" && message.body === item.question))) return false;
    if (wanted === "active" && thread.status !== "active") return false;
    if (!q) return true;
    const blob = messages.filter((message) => message.thread_id === thread.id).map((message) => message.body).join(" ").toLowerCase();
    return blob.includes(q) || thread.user_id.toLowerCase().includes(q);
  });
  const customerMessages = messages.filter((message) => message.role === "customer");
  const groups = new Map<string, { key: string; example: string; times: number }>();
  for (const message of customerMessages) {
    const key = questionKey(message.body);
    if (!key) continue;
    const found = groups.get(key);
    if (found) found.times += 1;
    else groups.set(key, { key, example: message.body, times: 1 });
  }
  const frequent = [...groups.values()].sort((a, b) => b.times - a.times).slice(0, 8);
  const helpfulYes = threads.filter((thread) => thread.helpful === "yes").length;
  const helpfulNo = threads.filter((thread) => thread.helpful === "no").length;
  const rated = helpfulYes + helpfulNo;
  const resolved = threads.filter((thread) => thread.status === "resolved").length;
  const escalated = threads.filter((thread) => thread.escalated || thread.status === "escalated").length;
  const openUnanswered = unanswered.filter((item) => !item.addressed);
  const insights = openUnanswered.slice(0, 5).map((item) => ({
    question: item.question,
    times: Number(item.times) || 0,
    suggestion: `Add an answer for: ${item.question}`,
  }));
  const durationOf = (thread: { started_at: string; updated_at: string }) => {
    const start = Date.parse(thread.started_at || "");
    const end = Date.parse(thread.updated_at || "");
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return (end - start) / 60000;
  };
  const durations = threads.map(durationOf).filter((value): value is number => value !== null);
  const resolvedDurations = threads.filter((thread) => thread.status === "resolved").map(durationOf).filter((value): value is number => value !== null);
  const average = (values: number[]) => (values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0);
  return {
    totals: {
      conversations: threads.length,
      messages: customerMessages.length,
      answered: Math.max(0, customerMessages.length - openUnanswered.reduce((sum, item) => sum + (Number(item.times) || 0), 0)),
      resolved,
      escalated,
      unanswered: openUnanswered.length,
      active: threads.filter((thread) => thread.status === "active").length,
      abandoned: threads.filter((thread) => thread.status === "abandoned").length,
      helpfulYes,
      helpfulNo,
      satisfaction: rated ? Math.round((helpfulYes / rated) * 100) : 0,
      rated,
      averageDurationMinutes: average(durations),
      averageResolutionMinutes: average(resolvedDurations),
    },
    threads: scoped.slice(0, 40).map((thread) => ({
      ...thread,
      messages: messages.filter((message) => message.thread_id === thread.id).slice().reverse(),
    })),
    unanswered,
    frequent,
    insights,
  };
}

export async function setVeraThreadStatus(id: string, status: "active" | "resolved" | "escalated" | "abandoned", actor: string) {
  const sql = await getSql();
  await sql.query("update shop_vera_threads set status = $2, escalated = escalated or $3, updated_at = $4 where id = $1", [
    id,
    status,
    status === "escalated",
    new Date().toISOString(),
  ]);
  await logAdmin(actor, "vera thread status", `${id}:${status}`);
  return { error: null as string | null };
}

export async function addressUnanswered(id: string, answer: string, actor: string) {
  const body = answer.trim().slice(0, 4000);
  if (!body) return { error: "Write the answer first." };
  const sql = await getSql();
  const rows = await sql.query<{ question: string }>("select question from shop_vera_unanswered where id = $1", [id]);
  const row = rows[0];
  if (!row) return { error: "Question not found." };
  const saved = await saveVeraKnowledge({ category: "Technical Troubleshooting", title: row.question.slice(0, 140), body, enabled: true }, actor);
  if (saved.error) return saved;
  await sql.query("update shop_vera_unanswered set addressed = true, updated_at = $2 where id = $1", [id, new Date().toISOString()]);
  await logAdmin(actor, "answer unanswered", id);
  return { error: null as string | null };
}

export async function suggestVeraKnowledge(question: string, actor: string) {
  return saveVeraKnowledge({
    category: "Technical Troubleshooting",
    title: question.trim().slice(0, 140),
    body: "Suggested from Vera analytics. Rewrite this before turning it on.",
    enabled: false,
  }, actor);
}

export async function deleteOldVeraThreads(days: number, actor: string) {
  const span = Math.min(365, Math.max(7, Math.round(days) || 90));
  const cutoff = new Date(Date.now() - span * 86400000).toISOString();
  const sql = await getSql();
  const old = await sql.query<{ id: string }>("select id from shop_vera_threads where started_at < $1 and status <> 'active'", [cutoff]);
  const ids = old.map((row) => row.id);
  for (const id of ids) {
    await sql.query("delete from shop_vera_messages where thread_id = $1", [id]);
    await sql.query("delete from shop_vera_threads where id = $1", [id]);
  }
  await logAdmin(actor, "delete old vera threads", `${ids.length} before ${cutoff}`);
  return { error: null as string | null, removed: ids.length };
}
