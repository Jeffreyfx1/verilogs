import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ComplaintThread, StatusHistory, StatusPill } from "@/components/complaint-view";
import { Button, Field, inputClass } from "@/components/ui";
import { COMPLAINT_STATUSES, adminStatusLabel, type ComplaintDetail } from "@/lib/complaints";
import { naira, when } from "@/lib/money";
import { noteAdminComplaint, readComplaint, replyAdminComplaint, setComplaintStatus } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/complaints/$id")({ component: AdminComplaintPage });

function AdminComplaintPage() {
  const { id } = Route.useParams();
  const boot = useStore((s) => s.boot);
  const [detail, setDetail] = useState<ComplaintDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [closeAs, setCloseAs] = useState<"awaiting_customer" | "resolved">("awaiting_customer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");

  const load = (spin: boolean) => {
    if (spin) setLoading(true);
    readComplaint({ data: { id } })
      .then((res) => {
        if (res.error || !res.detail) {
          setDetail(null);
          setError(res.error || "Complaint not found.");
          return;
        }
        setError("");
        setDetail(res.detail);
      })
      .catch(() => setError("Could not open that complaint."))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load(false);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [id]);

  const row = detail?.complaint;
  const notes = (detail?.messages || []).filter((item) => item.internal);
  return (
    <div className="space-y-4">
      <Link to="/admin/complaints" className="text-sm font-semibold text-primary">Back to complaints</Link>
      {loading && !detail ? <p className="text-sm text-muted">Loading complaint…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {row && detail ? (
        <>
          <section className="rounded-card border border-line bg-card p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold text-muted">{row.reference}</p>
                <h1 className="text-2xl font-extrabold">{row.subject}</h1>
                <p className="mt-1 text-sm">{row.userName || "Customer"} · {row.userEmail}</p>
                <p className="text-xs text-muted">Account {row.userId}</p>
                <p className="mt-1 text-sm text-muted">{row.category} · submitted {when(row.createdAt)}{row.lastReplyAt ? ` · last reply ${when(row.lastReplyAt)}` : ""}</p>
              </div>
              <StatusPill status={row.status} admin />
            </div>
            {row.orderRef ? <p className="mt-3 text-sm">Order reference {row.orderRef}</p> : null}
            {detail.order ? <p className="text-sm text-muted">{detail.order.title} · {detail.order.status} · {naira(detail.order.amount)} · {when(detail.order.createdAt)}</p> : null}
            {detail.screenshot ? <img src={detail.screenshot} alt="Customer screenshot" className="mt-3 max-h-96 rounded-xl border border-line object-contain" /> : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {COMPLAINT_STATUSES.map((status) => (
                <Button
                  key={status}
                  tone="soft"
                  disabled={busy !== "" || row.status === status}
                  onClick={() => {
                    setBusy(status);
                    void setComplaintStatus({ data: { id, status } })
                      .then((res) => {
                        if (res.error) toast.error(res.error);
                        else {
                          toast.success(status === "under_review" && row.status === "resolved" ? "Complaint reopened" : `Marked ${adminStatusLabel(status)}`);
                          boot(true);
                          load(false);
                        }
                      })
                      .catch(() => toast.error("Could not update the status."))
                      .finally(() => setBusy(""));
                  }}
                >
                  {status === "under_review" && row.status === "resolved" ? "Reopen" : `Mark ${adminStatusLabel(status)}`}
                </Button>
              ))}
            </div>
          </section>
          <section className="rounded-card border border-line bg-card p-5 shadow-card">
            <h2 className="font-bold">Conversation</h2>
            <div className="mt-3">
              <ComplaintThread messages={detail.messages.filter((item) => !item.internal)} viewer="admin" />
            </div>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) return;
                setBusy("reply");
                void replyAdminComplaint({ data: { id, body, status: closeAs } })
                  .then((res) => {
                    if (res.error) toast.error(res.error);
                    else {
                      toast.success("Reply sent to the customer");
                      setBody("");
                      boot(true);
                      load(false);
                    }
                  })
                  .catch(() => toast.error("Could not send that reply."))
                  .finally(() => setBusy(""));
              }}
            >
              <Field label="Reply to the customer">
                <textarea className={inputClass} required rows={4} maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} />
              </Field>
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">After sending</span>
                <select className={inputClass} value={closeAs} onChange={(event) => setCloseAs(event.target.value === "resolved" ? "resolved" : "awaiting_customer")}>
                  <option value="awaiting_customer">Mark as awaiting customer</option>
                  <option value="resolved">Mark as resolved</option>
                </select>
              </label>
              <Button type="submit" busy={busy === "reply"}>{busy === "reply" ? "Sending…" : "Send reply"}</Button>
            </form>
          </section>
          <section className="rounded-card border border-dashed border-amber-400 bg-card p-5 shadow-card">
            <h2 className="font-bold">Internal notes</h2>
            <p className="mt-1 text-sm text-muted">Only administrators see these. The customer is not notified.</p>
            <div className="mt-3 space-y-2">
              {notes.map((item) => (
                <article key={item.id} className="rounded-xl bg-amber-50 px-3 py-2 text-sm">
                  <p className="whitespace-pre-wrap">{item.body}</p>
                  <p className="mt-1 text-xs text-muted">{when(item.createdAt)}</p>
                </article>
              ))}
              {!notes.length ? <p className="text-sm text-muted">No internal notes.</p> : null}
            </div>
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) return;
                setBusy("note");
                void noteAdminComplaint({ data: { id, body: note } })
                  .then((res) => {
                    if (res.error) toast.error(res.error);
                    else {
                      toast.success("Internal note saved");
                      setNote("");
                      load(false);
                    }
                  })
                  .catch(() => toast.error("Could not save that note."))
                  .finally(() => setBusy(""));
              }}
            >
              <Field label="Add an internal note">
                <textarea className={inputClass} required rows={3} maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} />
              </Field>
              <Button type="submit" tone="soft" busy={busy === "note"}>{busy === "note" ? "Saving…" : "Save note"}</Button>
            </form>
          </section>
          <StatusHistory events={detail.events} admin />
        </>
      ) : null}
    </div>
  );
}
