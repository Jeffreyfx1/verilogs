import { getSql } from "@/lib/db";
import { imageKind, mimeFor } from "@/lib/site-images";
import { uid } from "@/lib/money";
import {
  COMPLAINT_CATEGORIES,
  isComplaintStatus,
  customerStatusLabel,
  type ComplaintDetail,
  type ComplaintEvent,
  type ComplaintMessage,
  type ComplaintOrder,
  type ComplaintRow,
  type ComplaintStats,
  type ComplaintStatus,
} from "@/lib/complaints";

const PAGE = 12;
const MAX_SHOT = 350_000;

type Actor = { id: string; role: "admin" | "customer"; name: string; email: string };

function cleanLine(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function cleanBody(value: unknown, max: number) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function clientKeyOf(value: unknown) {
  const key = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(key) ? key : "";
}

function iso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const text = String(value ?? "");
  if (!text) return "";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}

function flag(value: unknown) {
  return value === true || value === "t" || value === "true" || value === 1;
}

function complaintRef() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "VL-";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

function decodeScreenshot(raw: unknown): { error: string } | { mime: string; base64: string } {
  const text = String(raw ?? "").trim();
  if (!text) return { mime: "", base64: "" };
  const match = /^data:image\/(?:png|jpe?g|webp);base64,([a-z0-9+/=\s]+)$/i.exec(text);
  if (!match) return { error: "Attach a PNG, JPG or WebP screenshot." };
  const b64 = match[1].replace(/\s/g, "");
  if (!b64 || b64.length > 480_000) return { error: "Screenshot must be under 350KB." };
  const bytes = Buffer.from(b64, "base64");
  if (bytes.length > MAX_SHOT) return { error: "Screenshot must be under 350KB." };
  if (bytes.length < 12) return { error: "Attach a PNG, JPG or WebP screenshot." };
  const kind = imageKind(bytes);
  if (kind !== "jpeg" && kind !== "png" && kind !== "webp") return { error: "Attach a PNG, JPG or WebP screenshot." };
  const mime = mimeFor(kind);
  if (!mime) return { error: "Attach a PNG, JPG or WebP screenshot." };
  return { mime, base64: bytes.toString("base64") };
}

function mapRow(row: Record<string, unknown>, adminReply = ""): ComplaintRow {
  return {
    id: String(row.id || ""),
    reference: String(row.reference || ""),
    userId: String(row.user_id || ""),
    userName: String(row.user_name || ""),
    userEmail: String(row.user_email || ""),
    subject: String(row.subject || ""),
    category: String(row.category || ""),
    body: String(row.body || ""),
    orderRef: String(row.order_ref || ""),
    status: String(row.status || "new"),
    adminUnread: flag(row.admin_unread),
    customerUnread: flag(row.customer_unread),
    hasScreenshot: flag(row.has_screenshot) || String(row.screenshot || "").length > 0,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    lastReplyAt: iso(row.last_reply_at),
    adminReply: adminReply || String(row.admin_reply || ""),
  };
}

async function orderSummary(ownerId: string, orderRef: string): Promise<ComplaintOrder | null> {
  if (!orderRef) return null;
  const { loadLight } = await import("@/lib/shop-core.server");
  const doc = await loadLight();
  const order = doc.orders.find((item) => item.id === orderRef && item.userId === ownerId);
  if (!order) return null;
  return {
    id: order.id,
    title: cleanLine(order.title || "Order", 140),
    status: cleanLine(order.status || "", 40),
    amount: Math.round(Number(order.amount) || 0),
    createdAt: String(order.createdAt || ""),
  };
}

async function claimOrder(userId: string, raw: unknown) {
  const ref = cleanLine(raw, 80);
  if (!ref) return { error: null as string | null, ref: "" };
  const { loadLight } = await import("@/lib/shop-core.server");
  const doc = await loadLight();
  const hit = doc.orders.find((item) => item.id === ref);
  if (hit && hit.userId !== userId) return { error: "That order is not on your account.", ref: "" };
  return { error: null as string | null, ref: hit ? hit.id : ref };
}

async function notify(notes: { userId: string; title: string; body: string; href: string }[]) {
  const list = notes.filter((note) => note.userId);
  if (!list.length) return;
  const { deliverSupportNotes } = await import("@/lib/shop-core.server");
  await deliverSupportNotes(list);
}

async function adminNoteTargets(exceptId = "") {
  const { loadLight } = await import("@/lib/shop-core.server");
  const doc = await loadLight();
  return doc.users.filter((user) => user.role === "admin" && user.id !== exceptId).map((user) => user.id);
}

function customerHref(id: string) {
  return `/dashboard/complaints/${id}`;
}

function adminHref(id: string) {
  return `/admin/complaints/${id}`;
}

async function findOwned(id: string, userId: string) {
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    "select * from shop_complaints where id = $1 and user_id = $2",
    [id, userId],
  );
  return rows[0] || null;
}

export async function submitComplaint(actor: Actor, input: {
  subject?: string;
  category?: string;
  body?: string;
  orderRef?: string;
  screenshot?: string;
  clientKey?: string;
}) {
  if (actor.role !== "customer") return { error: "Sign in as the customer to submit a complaint.", id: "", reference: "", duplicate: false };
  const subject = cleanLine(input.subject, 140);
  const body = cleanBody(input.body, 4000);
  const category = COMPLAINT_CATEGORIES.find((item) => item === cleanLine(input.category, 40)) || "";
  if (!subject) return { error: "Add a subject.", id: "", reference: "", duplicate: false };
  if (!category) return { error: "Choose a category.", id: "", reference: "", duplicate: false };
  if (body.length < 8) return { error: "Describe the issue in a sentence or two.", id: "", reference: "", duplicate: false };
  const shot = decodeScreenshot(input.screenshot);
  if ("error" in shot) return { error: shot.error, id: "", reference: "", duplicate: false };
  const order = await claimOrder(actor.id, input.orderRef);
  if (order.error) return { error: order.error, id: "", reference: "", duplicate: false };
  const clientKey = clientKeyOf(input.clientKey);
  const sql = await getSql();
  if (clientKey) {
    const prior = await sql.query<{ id: string; reference: string }>(
      "select id, reference from shop_complaints where user_id = $1 and client_key = $2 limit 1",
      [actor.id, clientKey],
    );
    if (prior[0]) return { error: null, id: prior[0].id, reference: prior[0].reference, duplicate: true };
  }
  const recent = await sql.query<{ id: string; reference: string }>(
    `select id, reference from shop_complaints
     where user_id = $1 and subject = $2 and body = $3 and created_at > now() - interval '20 seconds'
     order by created_at desc limit 1`,
    [actor.id, subject, body],
  );
  if (recent[0]) return { error: null, id: recent[0].id, reference: recent[0].reference, duplicate: true };

  const id = uid("cmp");
  const messageId = uid("cmsg");
  const eventId = uid("cevt");
  let reference = complaintRef();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await sql.query(
        `with created as (
           insert into shop_complaints
             (id, reference, user_id, user_name, user_email, subject, category, body, order_ref, status, admin_unread, customer_unread, client_key, screenshot_mime, screenshot, created_at, updated_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new', true, false, $10, $11, $12, now(), now())
           returning id
         ), noted as (
           insert into shop_complaint_messages (id, complaint_id, author_id, author_role, body, internal, created_at)
           select $13, id, $3, 'customer', $8, false, now() from created
         )
         insert into shop_complaint_events (id, complaint_id, from_status, to_status, actor_id, actor_role, note, created_at)
         select $14, id, '', 'new', $3, 'customer', 'Submitted', now() from created`,
        [id, reference, actor.id, cleanLine(actor.name, 80), cleanLine(actor.email, 120), subject, category, body, order.ref, clientKey, shot.mime, shot.base64, messageId, eventId],
      );
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/shop_complaints_client_key|client_key/i.test(message) && clientKey) {
        const prior = await sql.query<{ id: string; reference: string }>(
          "select id, reference from shop_complaints where user_id = $1 and client_key = $2 limit 1",
          [actor.id, clientKey],
        );
        if (prior[0]) return { error: null, id: prior[0].id, reference: prior[0].reference, duplicate: true };
      }
      if (/reference/i.test(message) && attempt < 4) {
        reference = complaintRef();
        continue;
      }
      throw err;
    }
  }

  const admins = await adminNoteTargets();
  await notify([
    { userId: actor.id, title: "Complaint received", body: `${reference} · ${subject}`, href: customerHref(id) },
    ...admins.map((userId) => ({
      userId,
      title: `${cleanLine(actor.name, 80) || "A customer"} made a complaint`,
      body: `${reference} · ${subject}`,
      href: adminHref(id),
    })),
  ]);
  return { error: null as string | null, id, reference, duplicate: false };
}

export async function listMyComplaints(actor: Actor) {
  if (!actor.id || actor.role !== "customer") return { error: "Sign in to see your complaints.", rows: [] as ComplaintRow[] };
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    `select c.id, c.reference, c.user_id, c.user_name, c.subject, c.category, c.body, c.order_ref, c.status,
            c.admin_unread, c.customer_unread, (c.screenshot <> '') as has_screenshot,
            c.created_at, c.updated_at, c.last_reply_at,
            (select m.body from shop_complaint_messages m
              where m.complaint_id = c.id and m.author_role = 'admin' and m.internal = false
              order by m.created_at desc limit 1) as admin_reply
     from shop_complaints c
     where c.user_id = $1
     order by c.created_at desc
     limit 100`,
    [actor.id],
  );
  return { error: null as string | null, rows: rows.map((row) => ({ ...mapRow(row), userEmail: "" })) };
}

export async function readComplaint(actor: Actor, rawId: string) {
  const id = cleanLine(rawId, 48);
  if (!id) return { error: "Complaint not found.", detail: null as ComplaintDetail | null };
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>("select * from shop_complaints where id = $1", [id]);
  const row = rows[0];
  if (!row) return { error: "Complaint not found.", detail: null };
  const owner = String(row.user_id || "");
  const admin = actor.role === "admin";
  if (!admin && owner !== actor.id) return { error: "Complaint not found.", detail: null };
  if (admin && flag(row.admin_unread)) {
    await sql.query("update shop_complaints set admin_unread = false where id = $1 and admin_unread = true", [id]);
    row.admin_unread = false;
  }
  if (!admin && flag(row.customer_unread)) {
    await sql.query("update shop_complaints set customer_unread = false where id = $1 and customer_unread = true", [id]);
    row.customer_unread = false;
  }
  const messages = await sql.query<Record<string, unknown>>(
    `select id, author_role, body, internal, created_at
     from shop_complaint_messages where complaint_id = $1 order by created_at asc`,
    [id],
  );
  const events = await sql.query<Record<string, unknown>>(
    `select id, from_status, to_status, actor_role, note, created_at
     from shop_complaint_events where complaint_id = $1 order by created_at asc`,
    [id],
  );
  const visible: ComplaintMessage[] = messages
    .filter((item) => admin || !flag(item.internal))
    .map((item) => ({
      id: String(item.id || ""),
      role: item.author_role === "admin" ? "admin" : "customer",
      body: String(item.body || ""),
      internal: flag(item.internal),
      createdAt: iso(item.created_at),
    }));
  const history: ComplaintEvent[] = events.map((item) => ({
    id: String(item.id || ""),
    fromStatus: String(item.from_status || ""),
    toStatus: String(item.to_status || ""),
    actorRole: String(item.actor_role || ""),
    note: String(item.note || ""),
    createdAt: iso(item.created_at),
  }));
  const mime = String(row.screenshot_mime || "");
  const shot = String(row.screenshot || "");
  const complaint = mapRow(row);
  if (!admin) complaint.userEmail = "";
  return {
    error: null as string | null,
    detail: {
      complaint,
      messages: visible,
      events: history,
      order: await orderSummary(owner, complaint.orderRef),
      screenshot: shot && mime ? `data:${mime};base64,${shot}` : "",
    },
  };
}

export async function replyComplaint(actor: Actor, rawId: string, rawBody: string) {
  if (actor.role !== "customer") return { error: "Sign in as the customer to reply.", id: "" };
  const id = cleanLine(rawId, 48);
  const body = cleanBody(rawBody, 4000);
  if (body.length < 2) return { error: "Write a reply.", id: "" };
  const row = await findOwned(id, actor.id);
  if (!row) return { error: "Complaint not found.", id: "" };
  const status = String(row.status || "new");
  const next: ComplaintStatus = status === "awaiting_customer" || status === "resolved" ? "under_review" : (isComplaintStatus(status) ? status : "under_review");
  const sql = await getSql();
  if (next !== status) {
    await sql.query(
      `with msg as (
         insert into shop_complaint_messages (id, complaint_id, author_id, author_role, body, internal, created_at)
         values ($1, $2, $3, 'customer', $4, false, now())
         returning complaint_id
       ), evt as (
         insert into shop_complaint_events (id, complaint_id, from_status, to_status, actor_id, actor_role, note, created_at)
         select $5, complaint_id, $6, $7, $3, 'customer', 'Customer sent a follow-up', now() from msg
       )
       update shop_complaints
       set status = $7, admin_unread = true, updated_at = now(), last_reply_at = now()
       where id = $2`,
      [uid("cmsg"), id, actor.id, body, uid("cevt"), status, next],
    );
  } else {
    await sql.query(
      `with msg as (
         insert into shop_complaint_messages (id, complaint_id, author_id, author_role, body, internal, created_at)
         values ($1, $2, $3, 'customer', $4, false, now())
       )
       update shop_complaints
       set admin_unread = true, updated_at = now(), last_reply_at = now()
       where id = $2`,
      [uid("cmsg"), id, actor.id, body],
    );
  }
  const reference = String(row.reference || "");
  const admins = await adminNoteTargets();
  await notify(admins.map((userId) => ({
    userId,
    title: `${cleanLine(actor.name, 80) || "A customer"} replied to a complaint`,
    body: reference || "Open the complaint",
    href: adminHref(id),
  })));
  return { error: null as string | null, id };
}

function emptyStats(): ComplaintStats {
  return { total: 0, fresh: 0, unread: 0, pending: 0, awaiting: 0, resolved: 0 };
}

export async function adminComplaintDesk(actor: Actor, input: {
  q?: string;
  status?: string;
  category?: string;
  sort?: string;
  page?: number;
}) {
  if (actor.role !== "admin") {
    return { error: "Only an admin can do that.", rows: [] as ComplaintRow[], total: 0, page: 1, pages: 1, stats: emptyStats() };
  }
  const q = cleanLine(input.q, 80);
  const status = isComplaintStatus(String(input.status || "")) ? String(input.status) : "";
  const category = COMPLAINT_CATEGORIES.find((item) => item === cleanLine(input.category, 40)) || "";
  const oldest = input.sort === "oldest";
  const page = Math.max(1, Math.min(200, Math.round(Number(input.page) || 1)));
  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    const pattern = `%${q.replace(/[%_\\]/g, "")}%`;
    const start = params.length + 1;
    params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
    where.push(`(reference ilike $${start} or subject ilike $${start + 1} or body ilike $${start + 2} or user_name ilike $${start + 3} or user_email ilike $${start + 4} or user_id ilike $${start + 5} or order_ref ilike $${start + 6})`);
  }
  if (status) {
    params.push(status);
    where.push(`status = $${params.length}`);
  }
  if (category) {
    params.push(category);
    where.push(`category = $${params.length}`);
  }
  const filter = where.length ? `where ${where.join(" and ")}` : "";
  const sql = await getSql();
  const statsRows = await sql.query<Record<string, unknown>>(
    `select count(*)::int as total,
            count(*) filter (where status = 'new')::int as fresh,
            count(*) filter (where admin_unread)::int as unread,
            count(*) filter (where status in ('new', 'under_review'))::int as pending,
            count(*) filter (where admin_unread and status <> 'resolved')::int as awaiting,
            count(*) filter (where status = 'resolved')::int as resolved
     from shop_complaints`,
  );
  const statsRow = statsRows[0] || {};
  const stats: ComplaintStats = {
    total: Number(statsRow.total) || 0,
    fresh: Number(statsRow.fresh) || 0,
    unread: Number(statsRow.unread) || 0,
    pending: Number(statsRow.pending) || 0,
    awaiting: Number(statsRow.awaiting) || 0,
    resolved: Number(statsRow.resolved) || 0,
  };
  const countRows = await sql.query<{ n: number }>(`select count(*)::int as n from shop_complaints ${filter}`, params);
  const total = Number(countRows[0]?.n) || 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const safePage = Math.min(page, pages);
  const rows = await sql.query<Record<string, unknown>>(
    `select c.id, c.reference, c.user_id, c.user_name, c.user_email, c.subject, c.category, c.body, c.order_ref, c.status,
            c.admin_unread, c.customer_unread, (c.screenshot <> '') as has_screenshot,
            c.created_at, c.updated_at, c.last_reply_at,
            (select m.body from shop_complaint_messages m
              where m.complaint_id = c.id and m.internal = false
              order by m.created_at desc limit 1) as admin_reply
     from shop_complaints c
     ${filter}
     order by c.created_at ${oldest ? "asc" : "desc"}
     limit ${PAGE} offset ${(safePage - 1) * PAGE}`,
    params,
  );
  return { error: null as string | null, rows: rows.map((row) => mapRow(row)), total, page: safePage, pages, stats };
}

export async function replyAdminComplaint(actor: Actor, rawId: string, rawBody: string, rawStatus: string) {
  if (actor.role !== "admin") return { error: "Only an admin can reply.", id: "" };
  const id = cleanLine(rawId, 48);
  const body = cleanBody(rawBody, 4000);
  const next: ComplaintStatus = rawStatus === "resolved" ? "resolved" : "awaiting_customer";
  if (body.length < 2) return { error: "Write a reply.", id: "" };
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>("select * from shop_complaints where id = $1", [id]);
  const row = rows[0];
  if (!row) return { error: "Complaint not found.", id: "" };
  const status = String(row.status || "new");
  if (next !== status) {
    await sql.query(
      `with msg as (
         insert into shop_complaint_messages (id, complaint_id, author_id, author_role, body, internal, created_at)
         values ($1, $2, $3, 'admin', $4, false, now())
         returning complaint_id
       ), evt as (
         insert into shop_complaint_events (id, complaint_id, from_status, to_status, actor_id, actor_role, note, created_at)
         select $5, complaint_id, $6, $7, $3, 'admin', 'Reply sent', now() from msg
       )
       update shop_complaints
       set status = $7, admin_unread = false, customer_unread = true, updated_at = now(), last_reply_at = now()
       where id = $2`,
      [uid("cmsg"), id, actor.id, body, uid("cevt"), status, next],
    );
  } else {
    await sql.query(
      `with msg as (
         insert into shop_complaint_messages (id, complaint_id, author_id, author_role, body, internal, created_at)
         values ($1, $2, $3, 'admin', $4, false, now())
       )
       update shop_complaints
       set admin_unread = false, customer_unread = true, updated_at = now(), last_reply_at = now()
       where id = $2`,
      [uid("cmsg"), id, actor.id, body],
    );
  }
  const reference = String(row.reference || "");
  const subject = String(row.subject || "");
  await notify([{
    userId: String(row.user_id || ""),
    title: next === "resolved" ? "Complaint resolved" : "Complaint reply",
    body: `${reference} · ${subject}`,
    href: customerHref(id),
  }]);
  return { error: null as string | null, id };
}

export async function noteAdminComplaint(actor: Actor, rawId: string, rawBody: string) {
  if (actor.role !== "admin") return { error: "Only an admin can add a note.", id: "" };
  const id = cleanLine(rawId, 48);
  const body = cleanBody(rawBody, 4000);
  if (body.length < 2) return { error: "Write the internal note.", id: "" };
  const sql = await getSql();
  const rows = await sql.query<{ id: string }>("select id from shop_complaints where id = $1", [id]);
  if (!rows[0]) return { error: "Complaint not found.", id: "" };
  await sql.query(
    `insert into shop_complaint_messages (id, complaint_id, author_id, author_role, body, internal, created_at)
     values ($1, $2, $3, 'admin', $4, true, now())`,
    [uid("cmsg"), id, actor.id, body],
  );
  return { error: null as string | null, id };
}

export async function setComplaintStatus(actor: Actor, rawId: string, rawStatus: string) {
  if (actor.role !== "admin") return { error: "Only an admin can change the status.", id: "" };
  const id = cleanLine(rawId, 48);
  if (!isComplaintStatus(rawStatus)) return { error: "Choose a valid status.", id: "" };
  const next = rawStatus;
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>("select * from shop_complaints where id = $1", [id]);
  const row = rows[0];
  if (!row) return { error: "Complaint not found.", id: "" };
  const status = String(row.status || "");
  if (status === next) return { error: null, id };
  await sql.query(
    `with evt as (
       insert into shop_complaint_events (id, complaint_id, from_status, to_status, actor_id, actor_role, note, created_at)
       select $1, id, status, $3, $4, 'admin', $5, now()
       from shop_complaints where id = $2 and status = $6
       returning complaint_id
     )
     update shop_complaints c
     set status = $3, customer_unread = true, updated_at = now()
     from evt
     where c.id = evt.complaint_id`,
    [uid("cevt"), id, next, actor.id, next === "under_review" && status === "resolved" ? "Reopened" : "Status changed", status],
  );
  const reference = String(row.reference || "");
  await notify([{
    userId: String(row.user_id || ""),
    title: next === "resolved" ? "Complaint resolved" : "Complaint update",
    body: `${reference} is now ${customerStatusLabel(next)}.`,
    href: customerHref(id),
  }]);
  return { error: null as string | null, id };
}

async function sessionActor(): Promise<Actor | null> {
  const { sessionCustomer } = await import("@/lib/shop-core.server");
  const me = await sessionCustomer();
  if (!me?.id) return null;
  return {
    id: me.id,
    role: me.role === "admin" ? "admin" : "customer",
    name: me.name || "",
    email: me.email || "",
  };
}

export async function submitComplaintForSession(input: {
  subject?: string;
  category?: string;
  body?: string;
  orderRef?: string;
  screenshot?: string;
  clientKey?: string;
}) {
  const actor = await sessionActor();
  if (!actor) return { error: "Sign in first.", id: "", reference: "", duplicate: false };
  return submitComplaint(actor, input);
}

export async function listMyComplaintsForSession() {
  const actor = await sessionActor();
  if (!actor) return { error: "Sign in first.", rows: [] as ComplaintRow[] };
  return listMyComplaints(actor);
}

export async function readComplaintForSession(id: string) {
  const actor = await sessionActor();
  if (!actor) return { error: "Sign in first.", detail: null as ComplaintDetail | null };
  return readComplaint(actor, id);
}

export async function replyComplaintForSession(id: string, body: string) {
  const actor = await sessionActor();
  if (!actor) return { error: "Sign in first.", id: "" };
  return replyComplaint(actor, id, body);
}

export async function adminComplaintDeskForSession(input: { q?: string; status?: string; category?: string; sort?: string; page?: number }) {
  const actor = await sessionActor();
  if (!actor) return { error: "Sign in first.", rows: [] as ComplaintRow[], total: 0, page: 1, pages: 1, stats: emptyStats() };
  return adminComplaintDesk(actor, input);
}

export async function replyAdminComplaintForSession(id: string, body: string, status: string) {
  const actor = await sessionActor();
  if (!actor) return { error: "Sign in first.", id: "" };
  return replyAdminComplaint(actor, id, body, status);
}

export async function noteAdminComplaintForSession(id: string, body: string) {
  const actor = await sessionActor();
  if (!actor) return { error: "Sign in first.", id: "" };
  return noteAdminComplaint(actor, id, body);
}

export async function setComplaintStatusForSession(id: string, status: string) {
  const actor = await sessionActor();
  if (!actor) return { error: "Sign in first.", id: "" };
  return setComplaintStatus(actor, id, status);
}
