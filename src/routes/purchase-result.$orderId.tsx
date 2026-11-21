import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Guard } from "@/components/guard";
import { Glyph, glyph } from "@/components/icons";
import { purchaseResult, cancelRentNumber, finishRentNumber } from "@/lib/shop-fns";
import { naira, when } from "@/lib/money";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/purchase-result/$orderId")({
  component: () => (
    <Guard>
      <ResultPage />
    </Guard>
  ),
});

type View = NonNullable<Awaited<ReturnType<typeof purchaseResult>>["view"]>;

function ResultPage() {
  const { orderId } = Route.useParams();
  const adopt = useStore((s) => s.adopt);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [acting, setActing] = useState("");

  const load = async (refresh: boolean) => {
    setChecking(true);
    try {
      const res = await purchaseResult({ data: { orderId, refresh } });
      if (res.error || !res.view) setError(res.error || "That purchase was not found.");
      else {
        setError("");
        setView(res.view);
      }
    } catch {
      setError("Could not open this purchase.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void load(true);
  }, [orderId]);

  useEffect(() => {
    if (!view?.poll) return;
    const timer = window.setInterval(() => { void load(true); }, 8000);
    return () => window.clearInterval(timer);
  }, [view?.poll, orderId]);

  const rentAct = async (action: "cancel" | "finish") => {
    setActing(action);
    try {
      const res = action === "cancel" ? await cancelRentNumber({ data: { orderId } }) : await finishRentNumber({ data: { orderId } });
      if (res.error) toast.error(res.error);
      else {
        if (res.state) adopt(res.state);
        toast.success(action === "cancel" ? "Rental cancelled." : "Rental finished.");
        await load(true);
      }
    } catch {
      toast.error("Could not update this rental.");
    } finally {
      setActing("");
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy that.");
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link to="/dashboard/history" className="text-sm font-extrabold text-primary">Back to order history</Link>
      <h1 className="text-2xl font-extrabold">Purchase result</h1>
      {error ? <p className="rounded-2xl border border-line bg-card p-4 text-sm text-danger">{error}</p> : null}
      {view ? (
        <article className="space-y-4 rounded-[1.4rem] border border-line bg-card p-4 shadow-card">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#0c6e8a]">{view.kind}</p>
            <h2 className="mt-1 text-xl font-extrabold">{view.title}</h2>
            <p className="mt-1 text-sm text-muted">{naira(view.amount)} · {view.status}{view.providerStatus ? ` · ${view.providerStatus}` : ""}</p>
            {view.createdAt ? <p className="text-xs text-muted">{when(view.createdAt)}</p> : null}
          </div>
          <dl className="space-y-2 text-sm">
            {view.server ? <Row label="Server" value={view.server} /> : null}
            {view.country ? <Row label="Country" value={view.country} /> : null}
            {view.service ? <Row label="Service" value={view.service} /> : null}
            {view.network ? <Row label="Network" value={view.network} /> : null}
            {view.phone ? <Row label="Number" value={view.phone} onCopy={() => void copy(view.phone, "Number")} /> : null}
            {view.reference ? <Row label="Order reference" value={view.reference} /> : null}
            {view.code ? <Row label="Verification code" value={view.code} onCopy={() => void copy(view.code, "Code")} /> : null}
          </dl>
          {view.delivery.length ? (
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Delivered by the provider</p>
              <ul className="mt-2 space-y-2">
                {view.delivery.map((line) => (
                  <li key={line} className="flex items-start justify-between gap-2 rounded-xl bg-paper px-3 py-2 font-mono text-sm">
                    <span className="min-w-0 break-all">{line}</span>
                    <button type="button" className="shrink-0 text-xs font-extrabold text-primary" onClick={() => void copy(line, "Delivery")}>Copy</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {view.kind === "number" ? (
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Messages</p>
              {view.poll ? <p className="mt-2 text-sm text-muted">{checking ? "Checking the provider…" : "Waiting for an SMS. This page checks without reloading."}</p> : null}
              <ul className="mt-2 space-y-2">
                {view.messages.map((message, index) => (
                  <li key={`${message.at}-${message.code}-${index}`} className="rounded-xl bg-paper px-3 py-2 text-sm">
                    <p className="text-xs text-muted">{[message.sender, message.at ? when(message.at) : ""].filter(Boolean).join(" · ") || "SMS"}</p>
                    {message.text ? <p className="mt-1 whitespace-pre-wrap break-words">{message.text}</p> : null}
                    {message.code ? (
                      <button type="button" className="mt-1 font-extrabold text-primary" onClick={() => void copy(message.code, "Code")}>Code {message.code}</button>
                    ) : null}
                  </li>
                ))}
                {!view.messages.length ? <li className="text-sm text-muted">No message stored yet.</li> : null}
              </ul>
            </div>
          ) : null}
          <p className="text-sm text-muted">{view.note}</p>
          {view.server === "Rent number" && view.status === "waiting" ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm font-extrabold" disabled={!!acting} onClick={() => void rentAct("cancel")}>{acting === "cancel" ? "Cancelling…" : "Cancel rental"}</button>
              <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm font-extrabold" disabled={!!acting} onClick={() => void rentAct("finish")}>{acting === "finish" ? "Finishing…" : "Finish rental"}</button>
            </div>
          ) : null}
          <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-extrabold" onClick={() => void load(true)}>
            <Glyph icon={glyph.history} className="size-4" />
            {checking ? "Checking…" : "Refresh"}
          </button>
        </article>
      ) : null}
    </div>
  );
}

function Row({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-paper px-3 py-2">
      <div>
        <dt className="text-xs text-muted">{label}</dt>
        <dd className="font-semibold break-all">{value}</dd>
      </div>
      {onCopy ? <button type="button" className="text-xs font-extrabold text-primary" onClick={onCopy}>Copy</button> : null}
    </div>
  );
}
