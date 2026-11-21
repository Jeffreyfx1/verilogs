import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { answerUnanswered, pruneVera, setVeraStatus, suggestVera, veraDesk } from "@/lib/cms-fns";

export const Route = createFileRoute("/admin/vera-analytics")({ component: VeraAnalytics });

type Report = NonNullable<Awaited<ReturnType<typeof veraDesk>>["report"]>;

const FILTERS = [
  ["", "All"],
  ["resolved", "Resolved"],
  ["unresolved", "Unresolved"],
  ["escalated", "Escalated"],
  ["unanswered", "Unanswered"],
  ["active", "Active"],
] as const;

function VeraAnalytics() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [days, setDays] = useState(90);
  const [report, setReport] = useState<Report | null>(null);
  const [openId, setOpenId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = (next?: { q?: string; status?: string; from?: string; to?: string }) => {
    veraDesk({ data: { q: next?.q ?? q, status: next?.status ?? status, from: next?.from ?? from, to: next?.to ?? to } })
      .then((res) => {
        if (res.error || !res.report) return toast.error(res.error || "No analytics.");
        setReport(res.report);
      })
      .catch(() => toast.error("Could not load Vera analytics."));
  };

  useEffect(() => {
    load();
    // first paint only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = report?.totals;
  const chartMax = Math.max(totals?.conversations || 0, 1);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Vera analytics</h1>
        <p className="mt-1 text-sm text-muted">Counts come from recorded conversations. A reply alone is not a resolution. Empty charts mean no conversations yet.</p>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Conversations", totals?.conversations],
          ["Customer messages", totals?.messages],
          ["Answered", totals?.answered],
          ["Resolved", totals?.resolved],
          ["Escalated", totals?.escalated],
          ["Unanswered", totals?.unanswered],
          ["Active", totals?.active],
          ["Satisfaction", totals ? `${totals.satisfaction}%` : "0%"],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-card border border-line bg-card p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-xl font-extrabold">{value ?? "—"}</p>
          </div>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-card border border-line bg-card p-4">
          <h2 className="font-extrabold">Resolution</h2>
          <Bar label="Resolved by feedback or an admin" value={totals?.resolved || 0} max={chartMax} />
          <Bar label="Escalated to Telegram" value={totals?.escalated || 0} max={chartMax} />
          <Bar label="Still active" value={totals?.active || 0} max={chartMax} />
          <Bar label="Abandoned" value={totals?.abandoned || 0} max={chartMax} />
          <p className="text-xs text-muted">Average length {totals?.averageDurationMinutes ?? 0} min. Average time to a resolved conversation {totals?.averageResolutionMinutes ?? 0} min. Rated {totals?.rated ?? 0}: {totals?.helpfulYes ?? 0} helpful, {totals?.helpfulNo ?? 0} not helpful.</p>
        </div>
        <div className="space-y-2 rounded-card border border-line bg-card p-4">
          <h2 className="font-extrabold">Frequent questions</h2>
          {(report?.frequent || []).length === 0 ? <p className="text-sm text-muted">No customer messages yet.</p> : null}
          {(report?.frequent || []).map((item) => (
            <div key={item.key} className="rounded-xl bg-paper px-3 py-2 text-sm">
              <p>{item.example}</p>
              <p className="text-xs text-muted">{item.times} similar {item.times === 1 ? "ask" : "asks"}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-3 rounded-card border border-line bg-card p-4">
        <h2 className="font-extrabold">Find a conversation</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Customer or words"><input className={`${inputClass} text-base`} value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="Status">
            <select className={`${inputClass} text-base`} value={status} onChange={(e) => setStatus(e.target.value)}>
              {FILTERS.map(([value, label]) => <option key={label} value={value}>{label}</option>)}
            </select>
          </Field>
          <Field label="From"><input type="date" className={`${inputClass} text-base`} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><input type="date" className={`${inputClass} text-base`} value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => load()}>Apply</Button>
          <Button tone="soft" onClick={() => {
            if (!report) return;
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "vera-conversations.json";
            link.click();
            URL.revokeObjectURL(url);
          }}>Export</Button>
        </div>
        <div className="space-y-2">
          {(report?.threads || []).map((thread) => {
            const first = thread.messages.find((message) => message.role === "customer");
            const started = Date.parse(thread.started_at || "");
            const updated = Date.parse(thread.updated_at || "");
            const minutes = Number.isFinite(started) && Number.isFinite(updated) && updated >= started ? Math.round((updated - started) / 60000) : 0;
            return (
              <article key={thread.id} className="rounded-xl border border-line bg-paper p-3 text-sm">
                <button type="button" className="w-full text-left" onClick={() => setOpenId((current) => current === thread.id ? "" : thread.id)}>
                  <p className="font-bold">{first?.body || "No question yet"}</p>
                  <p className="text-xs text-muted">{thread.user_id || "Guest"} · {thread.status}{thread.escalated ? " · person needed" : ""} · {minutes} min · {thread.helpful === "yes" ? "Helpful" : thread.helpful === "no" ? "Not helpful" : "No rating"}</p>
                </button>
                {openId === thread.id ? (
                  <div className="mt-3 space-y-2">
                    {thread.messages.map((message) => (
                      <p key={message.id} className={`rounded-xl px-3 py-2 ${message.role === "customer" ? "bg-card" : "bg-white"}`}>
                        <span className="text-xs font-bold uppercase text-muted">{message.role}</span>
                        <span className="mt-1 block whitespace-pre-wrap">{message.body}</span>
                      </p>
                    ))}
                    {thread.comment ? <p className="text-xs text-muted">Comment: {thread.comment}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      {(["resolved", "escalated", "abandoned", "active"] as const).map((next) => (
                        <Button key={next} tone="soft" disabled={busy} onClick={() => {
                          setBusy(true);
                          setVeraStatus({ data: { id: thread.id, status: next } })
                            .then((res) => {
                              if (res.error) return toast.error(res.error);
                              toast.success("Status updated");
                              load();
                            })
                            .finally(() => setBusy(false));
                        }}>{next}</Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
      <section className="space-y-3 rounded-card border border-line bg-card p-4">
        <h2 className="font-extrabold">Unanswered questions</h2>
        {(report?.unanswered || []).length === 0 ? <p className="text-sm text-muted">None recorded.</p> : null}
        {(report?.unanswered || []).map((item) => (
          <div key={item.id} className="space-y-2 rounded-xl bg-paper p-3 text-sm">
            <p className="font-semibold">{item.question}</p>
            <p className="text-xs text-muted">Asked {item.times} {item.times === 1 ? "time" : "times"} · {item.addressed ? "Addressed" : "Open"} · {item.updated_at.slice(0, 16).replace("T", " ")}</p>
            {item.context ? <p className="whitespace-pre-wrap text-xs text-muted">{item.context}</p> : null}
            {item.addressed ? null : (
              <>
                <textarea className={`${inputClass} text-base`} rows={3} placeholder="Correct answer for Vera" value={answers[item.id] || ""} onChange={(e) => setAnswers((prev) => ({ ...prev, [item.id]: e.target.value }))} />
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busy} onClick={() => {
                    setBusy(true);
                    answerUnanswered({ data: { id: item.id, answer: answers[item.id] || "" } })
                      .then((res) => {
                        if (res.error) return toast.error(res.error);
                        toast.success("Added to Vera’s knowledge");
                        load();
                      })
                      .finally(() => setBusy(false));
                  }}>Add to knowledge</Button>
                  <Button tone="soft" disabled={busy} onClick={() => {
                    suggestVera({ data: { question: item.question } }).then((res) => {
                      if (res.error) return toast.error(res.error);
                      toast.success("Draft saved. It stays off until you enable it.");
                    });
                  }}>Save suggestion as draft</Button>
                </div>
              </>
            )}
          </div>
        ))}
      </section>
      <section className="space-y-2 rounded-card border border-line bg-card p-4">
        <h2 className="font-extrabold">What to improve</h2>
        <p className="text-sm text-muted">Suggestions stay drafts until an admin writes the answer and turns the article on.</p>
        {(report?.insights || []).length === 0 ? <p className="text-sm text-muted">No open gaps.</p> : null}
        {(report?.insights || []).map((item) => (
          <p key={item.question} className="text-sm">{item.suggestion} <span className="text-muted">({item.times})</span></p>
        ))}
      </section>
      <section className="space-y-3 rounded-card border border-line bg-card p-4">
        <h2 className="font-extrabold">Retention</h2>
        <p className="text-sm text-muted">Deletes finished conversations older than the number of days. Active conversations are left alone. Unanswered questions are kept.</p>
        <Field label="Days to keep">
          <input type="number" min={7} max={365} className={`${inputClass} text-base`} value={days} onChange={(e) => setDays(Number(e.target.value))} />
        </Field>
        <Button tone="danger" disabled={busy} onClick={() => {
          if (!confirm(`Delete finished Vera conversations older than ${days} days? Active ones stay.`)) return;
          setBusy(true);
          pruneVera({ data: { days } })
            .then((res) => {
              if (res.error) return toast.error(res.error);
              toast.success(`Removed ${"removed" in res ? res.removed : 0} old conversations`);
              load();
            })
            .finally(() => setBusy(false));
        }}>Delete old conversations</Button>
      </section>
    </div>
  );
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-xs"><span>{label}</span><span>{value} · {width}%</span></div>
      <div className="h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-primary" style={{ width: `${width}%` }} /></div>
    </div>
  );
}
