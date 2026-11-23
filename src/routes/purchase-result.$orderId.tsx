import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Guard } from "@/components/guard";
import { Glyph, glyph } from "@/components/icons";
import { purchaseResult, cancelRentNumber, finishRentNumber, cancelServer1Number } from "@/lib/shop-fns";
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

  const [confirm, setConfirm] = useState(false);

  const cancelNumber = async () => {
    setActing("number");
    try {
      const res = await cancelServer1Number({ data: { orderId } });
      if (res.error) toast.error(res.error);
      else toast.success("FiveSim cancelled this number. The refund is in your wallet.");
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
            {view.code ? <Row label="Verification code" value={view.code} onCopy={() => void copy(view.code, "Code")} /> : null}
          </dl>
          {view.kind === "number" && view.expiresAt ? <Remain expiresAt={view.expiresAt} done={view.status !== "waiting"} /> : null}
          {view.kind === "number" && view.status === "waiting" && !view.code ? <p className="text-sm text-muted">Waiting for the SMS. FiveSim is checked from the server.</p> : null}
          {view.status === "refunded" ? <p className="rounded-xl bg-paper px-3 py-2 text-sm">Cancelled. {naira(view.amount)} was returned to the wallet once.</p> : null}
          {view.status === "completed" || view.status === "received" ? <p className="text-sm text-muted">This number is finished. Cancellation is closed.</p> : null}
          {view.accounts.length ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Account information</p>
                <button type="button" className="text-xs font-extrabold text-primary" onClick={() => void copy(accountText(view.accounts), "Account details")}>Copy all</button>
              </div>
              <div className="mt-2 space-y-3">
                {view.accounts.map((account, index) => (
                  <div key={index} className="space-y-2">
                    {view.accounts.length > 1 ? <p className="text-xs font-extrabold text-ink">Account {index + 1}</p> : null}
                    {account.fields.map((field) => (
                      <div key={`${field.label}-${field.value}`} className="rounded-xl bg-paper px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-xs text-muted">{field.label}</p>
                          <button type="button" className="shrink-0 text-xs font-extrabold text-primary" onClick={() => void copy(field.value, field.label)}>Copy</button>
                        </div>
                        <FieldValue value={field.value} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {view.admin && view.delivery.length ? (
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-muted">Stored delivery</p>
              <ul className="mt-2 space-y-2">
                {view.delivery.map((line) => (
                  <li key={line} className="break-all rounded-xl bg-paper px-3 py-2 font-mono text-sm">{line}</li>
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
          {view.server === "Server 1" && view.kind === "number" && view.status === "waiting" ? (
            confirm ? (
              <div className="space-y-2 rounded-xl border border-line p-3">
                <p className="text-sm">Cancel this number with FiveSim? A refund is issued only if FiveSim confirms the cancellation.</p>
                <div className="flex gap-2">
                  <button type="button" className="rounded-xl bg-danger px-3 py-2 text-sm font-extrabold text-white" disabled={!!acting} onClick={() => void cancelNumber()}>{acting === "number" ? "Checking FiveSim…" : "Confirm cancel"}</button>
                  <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm font-extrabold" onClick={() => setConfirm(false)}>Keep it</button>
                </div>
              </div>
            ) : (
              <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm font-extrabold text-danger" onClick={() => setConfirm(true)}>Cancel number</button>
            )
          ) : null}
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

function Remain({ expiresAt, done }: { expiresAt: string; done: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (done) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [done, expiresAt]);
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return null;
  const left = Math.max(0, Math.floor((end - now) / 1000));
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return (
    <p className="rounded-xl bg-paper px-3 py-2 text-sm">
      <span className="text-xs text-muted">FiveSim expiry</span>
      <span className="mt-1 block font-extrabold">{done ? "Closed" : left ? `${minutes}:${String(seconds).padStart(2, "0")} remaining` : "Timer ended. Status is checked with FiveSim."}</span>
    </p>
  );
}

function accountText(accounts: View["accounts"]) {
  return accounts.flatMap((account, index) => [
    accounts.length > 1 ? `Account ${index + 1}` : "",
    ...account.fields.map((field) => `${field.label}: ${field.value}`),
  ]).filter(Boolean).join("\n");
}

function FieldValue({ value }: { value: string }) {
  const url = /^https:\/\/[^\s]+$/i.test(value) ? value : "";
  return url
    ? <a href={url} target="_blank" rel="noreferrer" className="mt-1 block break-all font-semibold text-primary underline">{value}</a>
    : <p className="mt-1 break-all font-semibold">{value}</p>;
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
