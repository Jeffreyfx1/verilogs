import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ComplaintThread, StatusHistory, StatusPill } from "@/components/complaint-view";
import { Button, Field, inputClass } from "@/components/ui";
import type { ComplaintDetail } from "@/lib/complaints";
import { naira, when } from "@/lib/money";
import { readComplaint, replyComplaint } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/dashboard/complaints/$id")({ component: ComplaintPage });

function ComplaintPage() {
  const { id } = Route.useParams();
  const boot = useStore((s) => s.boot);
  const [detail, setDetail] = useState<ComplaintDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

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
  return (
    <div className="space-y-4">
      <Link to="/dashboard/complaints" className="text-sm font-semibold text-primary">Back to complaints</Link>
      {loading && !detail ? <p className="text-sm text-muted">Loading complaint…</p> : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {row && detail ? (
        <>
          <section className="rounded-card border border-line bg-card p-5 shadow-card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-extrabold text-muted">{row.reference}</p>
                <h1 className="text-2xl font-extrabold">{row.subject}</h1>
                <p className="mt-1 text-sm text-muted">{row.category} · {when(row.createdAt)}{row.lastReplyAt ? ` · last reply ${when(row.lastReplyAt)}` : ""}</p>
              </div>
              <StatusPill status={row.status} />
            </div>
            {row.orderRef ? <p className="mt-3 text-sm">Order reference {row.orderRef}</p> : null}
            {detail.order ? <p className="text-sm text-muted">{detail.order.title} · {detail.order.status} · {naira(detail.order.amount)}</p> : null}
            {detail.screenshot ? <img src={detail.screenshot} alt="Screenshot attached to this complaint" className="mt-3 max-h-80 rounded-xl border border-line object-contain" /> : null}
          </section>
          <section className="rounded-card border border-line bg-card p-5 shadow-card">
            <h2 className="font-bold">Conversation</h2>
            <div className="mt-3">
              <ComplaintThread messages={detail.messages} viewer="customer" />
            </div>
            <form
              className="mt-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (busy) return;
                setBusy(true);
                void replyComplaint({ data: { id, body } })
                  .then((res) => {
                    if (res.error) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("Reply sent");
                    setBody("");
                    boot(true);
                    load(false);
                  })
                  .catch(() => toast.error("Could not send that reply."))
                  .finally(() => setBusy(false));
              }}
            >
              <Field label="Reply">
                <textarea className={inputClass} required rows={4} maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} />
              </Field>
              <Button type="submit" busy={busy}>{busy ? "Sending…" : "Send reply"}</Button>
            </form>
          </section>
          <StatusHistory events={detail.events} />
        </>
      ) : null}
    </div>
  );
}
