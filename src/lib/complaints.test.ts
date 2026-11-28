import assert from "node:assert/strict";
import test from "node:test";
import { getSql } from "@/lib/db";
import {
  adminComplaintDesk,
  listMyComplaints,
  noteAdminComplaint,
  readComplaint,
  replyAdminComplaint,
  replyComplaint,
  setComplaintStatus,
  submitComplaint,
} from "@/lib/complaints.server";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const ada = { id: "usr_cmp_a", role: "customer" as const, name: "Ada", email: "ada-cmp@example.com" };
const bola = { id: "usr_cmp_b", role: "customer" as const, name: "Bola", email: "bola-cmp@example.com" };
const admin = { id: "usr_cmp_admin", role: "admin" as const, name: "Desk", email: "desk-cmp@example.com" };

function shopDoc() {
  return {
    users: [
      { id: ada.id, name: ada.name, email: ada.email, role: "customer", passwordHash: "x", balance: 0, createdAt: "2026-11-01T00:00:00.000Z" },
      { id: bola.id, name: bola.name, email: bola.email, role: "customer", passwordHash: "x", balance: 0, createdAt: "2026-11-01T00:00:00.000Z" },
      { id: admin.id, name: admin.name, email: admin.email, role: "admin", passwordHash: "x", balance: 0, createdAt: "2026-11-01T00:00:00.000Z" },
    ],
    orders: [
      { id: "ord_cmp_a", userId: ada.id, title: "WhatsApp UK", status: "completed", amount: 500, createdAt: "2026-11-20T00:00:00.000Z", phone: "SECRETPHONE", code: "SECRETCODE", delivery: "SECRETDELIVERY" },
      { id: "ord_cmp_b", userId: bola.id, title: "Other person", status: "completed", amount: 900, createdAt: "2026-11-20T00:00:00.000Z", phone: "LEAKPHONE", code: "LEAKCODE", delivery: "LEAKDELIVERY" },
    ],
    notifications: [],
  };
}

async function notesFor(userId: string) {
  const sql = await getSql();
  const rows = await sql.query<{ doc: string }>("select doc from shop_state where id = 'main'");
  const doc = JSON.parse(String(rows[0]?.doc || "{}")) as { notifications?: { userId: string; title: string; body: string; href?: string }[] };
  return (doc.notifications || []).filter((note) => note.userId === userId);
}

test("a complaint is stored, replied to, hidden from another customer, and notified", async () => {
  const sql = await getSql();
  const before = await sql.query<{ doc: string }>("select doc from shop_state where id = 'main'");
  await sql.query("delete from shop_complaint_events where complaint_id in (select id from shop_complaints where user_id in ('usr_cmp_a', 'usr_cmp_b'))");
  await sql.query("delete from shop_complaint_messages where complaint_id in (select id from shop_complaints where user_id in ('usr_cmp_a', 'usr_cmp_b'))");
  await sql.query("delete from shop_complaints where user_id in ('usr_cmp_a', 'usr_cmp_b')");
  await sql.query("insert into shop_state (id, doc) values ('main', $1) on conflict (id) do update set doc = excluded.doc", [JSON.stringify(shopDoc())]);
  try {
    const badOrder = await submitComplaint(ada, { subject: "Wrong order", category: "Order", body: "This is not my order at all.", orderRef: "ord_cmp_b", clientKey: "client-key-bad-order" });
    assert.equal(badOrder.error, "That order is not on your account.");

    const badShot = await submitComplaint(ada, { subject: "Bad file", category: "Other", body: "This screenshot is not an image.", screenshot: "data:image/png;base64,AAAA", clientKey: "client-key-bad-shot" });
    assert.match(badShot.error || "", /PNG, JPG or WebP/);

    const created = await submitComplaint(ada, {
      subject: "Number never arrived",
      category: "Number",
      body: "I paid for a WhatsApp number and no code arrived.",
      orderRef: "ord_cmp_a",
      screenshot: png,
      clientKey: "client-key-ada-1",
    });
    assert.equal(created.error, null);
    assert.match(created.reference, /^VL-/);
    const again = await submitComplaint(ada, {
      subject: "Number never arrived",
      category: "Number",
      body: "I paid for a WhatsApp number and no code arrived.",
      orderRef: "ord_cmp_a",
      screenshot: png,
      clientKey: "client-key-ada-1",
    });
    assert.equal(again.duplicate, true);
    assert.equal(again.id, created.id);
    const count = await sql.query<{ n: number }>("select count(*)::int as n from shop_complaints where user_id = 'usr_cmp_a'");
    assert.equal(Number(count[0]?.n), 1);

    const desk = await adminComplaintDesk(admin, { q: created.reference, sort: "newest", page: 1 });
    assert.equal(desk.error, null);
    assert.equal(desk.rows.length, 1);
    assert.equal(desk.rows[0]?.userId, ada.id);
    assert.equal(desk.rows[0]?.userName, "Ada");
    assert.equal(desk.rows[0]?.orderRef, "ord_cmp_a");
    assert.equal(desk.stats.fresh >= 1, true);
    assert.equal(desk.stats.unread >= 1, true);
    const deniedDesk = await adminComplaintDesk(ada, { q: created.reference });
    assert.match(deniedDesk.error || "", /admin/);

    const opened = await readComplaint(admin, created.id);
    assert.equal(opened.error, null);
    assert.equal(opened.detail?.order?.title, "WhatsApp UK");
    assert.equal(opened.detail?.order?.amount, 500);
    assert.match(opened.detail?.screenshot || "", /^data:image\/png;base64,/);
    const openedText = JSON.stringify(opened.detail);
    assert.equal(openedText.includes("SECRETPHONE"), false);
    assert.equal(openedText.includes("SECRETCODE"), false);
    assert.equal(openedText.includes("SECRETDELIVERY"), false);
    assert.equal(openedText.includes("LEAKCODE"), false);

    const noted = await noteAdminComplaint(admin, created.id, "Checked the provider. Internal only.");
    assert.equal(noted.error, null);
    const customerBeforeReply = await readComplaint(ada, created.id);
    assert.equal(JSON.stringify(customerBeforeReply.detail).includes("Internal only"), false);
    assert.equal(customerBeforeReply.detail?.complaint.userEmail, "");

    const replied = await replyAdminComplaint(admin, created.id, "We are checking that number with the provider.", "awaiting_customer");
    assert.equal(replied.error, null);
    const adaNotes = await notesFor(ada.id);
    assert.ok(adaNotes.some((note) => note.href === `/dashboard/complaints/${created.id}` && note.body.includes(created.reference) && note.title === "Complaint reply"));
    const seen = await readComplaint(ada, created.id);
    assert.equal(seen.detail?.complaint.status, "awaiting_customer");
    assert.ok(seen.detail?.messages.some((item) => item.role === "admin" && item.body.includes("checking that number")));
    assert.equal(JSON.stringify(seen.detail).includes("Internal only"), false);

    const follow = await replyComplaint(ada, created.id, "The code is still missing this morning.");
    assert.equal(follow.error, null);
    const adminView = await readComplaint(admin, created.id);
    assert.ok(adminView.detail?.messages.some((item) => item.body.includes("still missing")));
    assert.ok(adminView.detail?.messages.some((item) => item.internal && item.body.includes("Internal only")));
    const adminNotes = await notesFor(admin.id);
    assert.ok(adminNotes.some((note) => note.href === `/admin/complaints/${created.id}` && note.body.includes(created.reference)));

    const resolved = await setComplaintStatus(admin, created.id, "resolved");
    assert.equal(resolved.error, null);
    const after = await readComplaint(ada, created.id);
    assert.equal(after.detail?.complaint.status, "resolved");
    assert.ok(after.detail?.events.some((event) => event.toStatus === "resolved"));
    const resolvedNotes = await notesFor(ada.id);
    assert.ok(resolvedNotes.some((note) => note.title === "Complaint resolved" && note.href === `/dashboard/complaints/${created.id}`));

    const stranger = await readComplaint(bola, created.id);
    assert.equal(stranger.detail, null);
    assert.equal(stranger.error, "Complaint not found.");
    const bolaList = await listMyComplaints(bola);
    assert.equal(bolaList.rows.length, 0);
    const adaList = await listMyComplaints(ada);
    assert.equal(adaList.rows.length, 1);
    assert.equal(adaList.rows[0]?.reference, created.reference);
    const impersonate = await replyAdminComplaint(ada, created.id, "I am pretending to be staff.", "resolved");
    assert.match(impersonate.error || "", /admin/);
    const still = await readComplaint(ada, created.id);
    assert.equal(JSON.stringify(still.detail).includes("pretending"), false);
  } finally {
    await sql.query("delete from shop_complaint_events where complaint_id in (select id from shop_complaints where user_id in ('usr_cmp_a', 'usr_cmp_b'))");
    await sql.query("delete from shop_complaint_messages where complaint_id in (select id from shop_complaints where user_id in ('usr_cmp_a', 'usr_cmp_b'))");
    await sql.query("delete from shop_complaints where user_id in ('usr_cmp_a', 'usr_cmp_b')");
    if (before[0]?.doc) await sql.query("update shop_state set doc = $1 where id = 'main'", [before[0].doc]);
    else await sql.query("delete from shop_state where id = 'main'");
  }
});
