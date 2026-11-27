import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Guard } from "@/components/guard";
import { purchaseResult, cancelRentNumber, finishRentNumber, cancelServer1Number, cancelUsaNumber } from "@/lib/shop-fns";
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
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());

  const seen = useRef(false);

  const load = async (refresh: boolean) => {
    setChecking(true);
    try {
      const res = await purchaseResult({ data: { orderId, refresh } });
      if (res.view) {
        seen.current = true;
        setError("");
        setView(res.view);
        if (res.view.phase !== "waiting") setConfirm(false);
      } else if (!seen.current) setError(res.error || "That purchase was not found.");
    } catch {
      if (!seen.current) setError("Could not open this purchase.");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { seen.current = false; void load(true); }, [orderId]);

  useEffect(() => {
    if (!view?.poll) return;
    const timer = window.setInterval(() => { void load(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [view?.poll, orderId]);

  useEffect(() => {
    const sync = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [orderId]);

  useEffect(() => {
    if (view?.kind !== "number" || (view.phase !== "waiting" && view.phase !== "received")) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [view?.kind, view?.phase, view?.expiresAt]);

  const cancelNumber = async () => {
    setActing("number");
    try {
      const server = view?.server || "";
      const res = server === "Rent number"
        ? await cancelRentNumber({ data: { orderId } })
        : server === "USA"
          ? await cancelUsaNumber({ data: { orderId } })
          : server === "Server 1"
            ? await cancelServer1Number({ data: { orderId } })
            : { error: "This number cannot be cancelled from here.", state: null };
      if (res.error) toast.error(res.error);
      else toast.success(view?.phase === "expired" ? "This number has expired." : "Cancelled. The refund is in your wallet.");
      if (res.state) adopt(res.state);
      await load(true);
    } catch {
      toast.error("Could not cancel this number.");
    } finally {
      setActing("");
    }
  };

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

  if (view?.kind === "number") return <NumberCard view={view} error={error} checking={checking} acting={acting} confirm={confirm} now={now} onCopy={copy} onRefresh={() => void load(true)} onCancel={() => void cancelNumber()} onAsk={() => setConfirm(true)} onKeep={() => setConfirm(false)} />;

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
            <p className="mt-1 text-sm text-muted">{naira(view.amount)} · {view.status}</p>
            {view.createdAt ? <p className="text-xs text-muted">{when(view.createdAt)}</p> : null}
          </div>
          {view.accounts.length ? (
            <div className="space-y-2">
              {view.accounts.map((account, index) => (
                <div key={index} className="space-y-2">
                  {account.fields.map((field) => (
                    <div key={`${field.label}-${field.value}`} className="rounded-xl bg-paper px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs text-muted">{field.label}</p>
                        <button type="button" className="text-xs font-extrabold text-primary" onClick={() => void copy(field.value, field.label)}>Copy</button>
                      </div>
                      <FieldValue value={field.value} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
          {view.rawHeld && !view.admin ? <p className="text-sm text-muted">The provider response for this Facebook purchase is stored unchanged and is not shown on this page.</p> : null}
          {view.admin && view.rawHeld ? <AdminDiagnostic view={view} onCopy={copy} /> : null}
          {view.server === "Rent number" && view.status === "waiting" ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm font-extrabold" disabled={!!acting} onClick={() => void rentAct("cancel")}>{acting === "cancel" ? "Cancelling…" : "Cancel rental"}</button>
              <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm font-extrabold" disabled={!!acting} onClick={() => void rentAct("finish")}>{acting === "finish" ? "Finishing…" : "Finish rental"}</button>
            </div>
          ) : null}
        </article>
      ) : error ? null : <p className="text-sm text-muted">Opening this purchase…</p>}
    </div>
  );
}

function AdminDiagnostic({ view, onCopy }: { view: View; onCopy: (value: string, label: string) => void }) {
  const response = view.delivery.join("\n");
  return (
    <section className="space-y-3 rounded-xl border border-line bg-paper px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold">Admin only · original provider response</p>
          <p className="mt-1 text-xs text-muted">Stored account text, unmodified. AccsZone sends each account as one string. Verilogs keeps those strings separated by a new line. This block is not written to logs.</p>
        </div>
        {response ? <button type="button" className="shrink-0 text-xs font-extrabold text-primary" onClick={() => void onCopy(response, "Provider response")}>Copy</button> : null}
      </div>
      {response ? <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-card px-2 py-2 text-xs">{response}</pre> : <p className="text-sm text-muted">No provider text was stored on this order.</p>}
      {view.detail ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-extrabold">Stored product description</p>
            <button type="button" className="text-xs font-extrabold text-primary" onClick={() => void onCopy(view.detail, "Product description")}>Copy</button>
          </div>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-card px-2 py-2 text-xs">{view.detail}</pre>
        </div>
      ) : null}
    </section>
  );
}

function NumberCard({ view, error, checking, acting, confirm, now, onCopy, onRefresh, onCancel, onAsk, onKeep }: {
  view: View;
  error: string;
  checking: boolean;
  acting: string;
  confirm: boolean;
  now: number;
  onCopy: (value: string, label: string) => void;
  onRefresh: () => void;
  onCancel: () => void;
  onAsk: () => void;
  onKeep: () => void;
}) {
  const clock = clockOf(view.expiresAt, view.createdAt, now);
  const code = view.code || view.messages.map((item) => item.code).filter(Boolean).pop() || "";
  const status = statusLabel(view.phase);
  const closed = view.phase === "completed" || view.phase === "cancelled" || view.phase === "expired";
  const earlier = view.messages.filter((item) => item.code && item.code !== code);
  return (
    <div className="mx-auto max-w-lg space-y-3">
      <Link to="/dashboard/numbers" search={{ server: "", country: "", kind: "", service: "" }} className="text-sm font-extrabold text-primary">Back to numbers</Link>
      {error ? <p className="rounded-2xl border border-line bg-card p-4 text-sm text-danger">{error}</p> : null}
      <article className="space-y-4 rounded-[1.4rem] bg-[#174c70] p-4 text-white shadow-card">
        <p className="text-center text-sm font-extrabold">Order {view.orderId.slice(0, 12)}</p>
        <dl className="space-y-1.5 text-sm">
          <Line label="Service" value={view.service || view.title} />
          <Line label="Country" value={view.country} />
          {view.server ? <Line label="Server" value={view.server} /> : null}
          <Line label="Price" value={naira(view.amount)} />
        </dl>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-white/70">Number</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="flex-1 rounded-xl bg-white/10 px-3 py-3 text-center font-mono text-lg font-extrabold">{view.phone || "Waiting for the number"}</p>
            {view.phone ? <button type="button" className="rounded-xl bg-[#1a8aa8] px-3 py-3 text-sm font-extrabold" onClick={() => onCopy(view.phone, "Number")}>Copy</button> : null}
          </div>
        </div>
        {clock ? (
          <div>
            <p className="text-center text-sm font-extrabold">Time remaining</p>
            <p className="mt-1 text-center text-xs text-white/70">{view.phase === "waiting" ? "The code usually arrives within a few minutes." : view.phase === "received" ? "The code is below. This number stays open until the service closes it." : closed ? "This order is closed." : ""}</p>
            <p className="mt-2 text-center text-2xl font-extrabold tabular-nums">{clock.label}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full rounded-full bg-[#1a8aa8] transition-all" style={{ width: `${clock.used}%` }} />
            </div>
          </div>
        ) : null}
        <div>
          <p className="text-xs font-extrabold uppercase tracking-wide text-white/70">Code from SMS</p>
          {code ? (
            <div className="mt-2 rounded-xl bg-white/10 px-3 py-3">
              <p className="text-xs text-white/70">OTP received</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="font-mono text-2xl font-extrabold">{code}</p>
                <button type="button" className="rounded-xl bg-[#1a8aa8] px-3 py-2 text-sm font-extrabold" onClick={() => onCopy(code, "Code")}>Copy</button>
              </div>
              {messageText(view) ? <p className="mt-2 break-words text-sm text-white/80">{messageText(view)}</p> : null}
              {earlier.length ? (
                <ul className="mt-2 space-y-1 text-sm text-white/80">
                  {view.messages.map((item, index) => (
                    <li key={`${item.at}-${item.code}-${index}`}>{item.code}{item.text ? ` · ${item.text}` : ""}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 rounded-xl bg-white/10 px-3 py-3 text-sm">{checking ? "Checking for SMS…" : "Waiting for SMS…"}</p>
          )}
        </div>
        <p className="text-sm"><span className="text-white/70">Status </span><span className="font-extrabold">{status}</span></p>
        {view.status === "refunded" && view.phase === "expired" ? <p className="text-sm text-white/80">This number expired. {naira(view.amount)} was returned to the wallet once.</p> : null}
        {view.status === "refunded" && view.phase !== "expired" ? <p className="text-sm text-white/80">Cancelled. {naira(view.amount)} was returned to the wallet once.</p> : null}
        {view.phase === "expired" && view.status !== "refunded" ? <p className="text-sm text-white/80">This number has expired.</p> : null}
        {view.cancellable ? (
          confirm ? (
            <div className="space-y-2 rounded-xl bg-white/10 p-3 text-sm">
              <p>Cancel this number? A refund is issued only if the service confirms it.</p>
              <div className="flex gap-2">
                <button type="button" className="rounded-xl bg-[#c43d4b] px-3 py-2 font-extrabold" disabled={!!acting} onClick={onCancel}>{acting === "number" ? "Checking…" : "Confirm cancel"}</button>
                <button type="button" className="rounded-xl border border-white/30 px-3 py-2 font-extrabold" onClick={onKeep}>Keep it</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" className="flex-1 rounded-xl bg-[#c43d4b] px-3 py-3 text-sm font-extrabold" onClick={onAsk}>Cancel order</button>
              <button type="button" className="flex-1 rounded-xl bg-[#1a8aa8] px-3 py-3 text-sm font-extrabold" disabled={checking} onClick={onRefresh}>{checking ? "Checking…" : "Refresh OTP"}</button>
            </div>
          )
        ) : (
          <button type="button" className="w-full rounded-xl bg-[#1a8aa8] px-3 py-3 text-sm font-extrabold" disabled={checking} onClick={onRefresh}>{checking ? "Checking…" : "Refresh"}</button>
        )}
      </article>
      <Link to="/dashboard/history" hash="numbers" className="inline-block text-sm font-extrabold text-primary">Order history</Link>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-white/70">{label}</dt>
      <dd className="font-extrabold">{value}</dd>
    </div>
  );
}

function statusLabel(phase: string) {
  if (phase === "cancelled") return "Cancelled";
  if (phase === "completed") return "Completed";
  if (phase === "expired") return "Expired";
  if (phase === "received") return "Code received";
  return "Waiting for SMS";
}

function messageText(view: { messages: { text: string; code: string }[]; code: string }) {
  const code = view.code || view.messages.map((item) => item.code).filter(Boolean).pop() || "";
  return view.messages.find((item) => item.code === code && item.text)?.text || view.messages.find((item) => item.text)?.text || "";
}

function clockOf(expiresAt: string, createdAt: string, now: number) {
  const end = Date.parse(expiresAt || "");
  if (!Number.isFinite(end)) return null;
  const start = Date.parse(createdAt || "") || end - 20 * 60 * 1000;
  const total = Math.max(1, end - start);
  const left = Math.max(0, Math.floor((end - now) / 1000));
  const used = Math.min(100, Math.max(0, Math.round(((now - start) / total) * 100)));
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return { label: `${minutes}:${String(seconds).padStart(2, "0")}`, used };
}

function FieldValue({ value }: { value: string }) {
  const url = /^https:\/\/[^\s]+$/i.test(value) ? value : "";
  return url
    ? <a href={url} target="_blank" rel="noreferrer" className="mt-1 block break-all font-semibold text-primary underline">{value}</a>
    : <p className="mt-1 break-all font-semibold">{value}</p>;
}
