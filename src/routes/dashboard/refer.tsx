import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { naira, when } from "@/lib/money";
import { moveReferral, myReferrals } from "@/lib/shop-fns";

export const Route = createFileRoute("/dashboard/refer")({ component: ReferPage });

function ReferPage() {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof myReferrals>> extends infer T ? T extends { summary: infer S } ? S : null : null>(null);
  const [amount, setAmount] = useState(100);
  const load = () => {
    myReferrals().then((res) => {
      if ("summary" in res && res.summary) setSummary(res.summary);
    }).catch(() => toast.error("Could not load referrals."));
  };
  useEffect(() => { load(); }, []);
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };
  const card = summary;
  return (
    <div className="space-y-4">
      <section className="rounded-[1.6rem] bg-gradient-to-br from-[#174C70] to-[#286D86] p-5 text-white">
        <p className="text-xs font-bold tracking-wide text-white/70">REFER & EARN</p>
        <h1 className="mt-1 text-2xl font-extrabold">Total referral earnings {naira(card?.earned || 0)}</h1>
        <p className="mt-1 text-sm text-white/80">You earn when someone you invite completes a first qualifying purchase. Registration alone does not pay.</p>
      </section>
      <div className="grid grid-cols-2 gap-3">
        {[
          ["Available", naira(card?.available || 0)],
          ["Referrals", String(card?.total || 0)],
          ["Successful", String(card?.successful || 0)],
          ["Pending", String(card?.pending || 0)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line bg-card p-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-xl font-extrabold">{value}</p>
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-line bg-card p-4">
        <Field label="Referral code"><input className={inputClass} readOnly value={card?.code || ""} /></Field>
        <Field label="Referral link"><input className={inputClass} readOnly value={card?.link || ""} /></Field>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button tone="soft" onClick={() => void copy(card?.code || "")}>Copy code</Button>
          <Button tone="soft" onClick={() => void copy(card?.link || "")}>Copy link</Button>
          <a className="rounded-xl bg-[#128C7E] px-4 py-2 text-sm font-extrabold text-white" href={`https://wa.me/?text=${encodeURIComponent(`Join VeriLogs: ${card?.link || ""}`)}`}>Share on WhatsApp</a>
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="font-extrabold">Move earnings to wallet</h2>
        <Field label="Amount"><input className={inputClass} inputMode="numeric" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></Field>
        <Button className="mt-3" onClick={() => void moveReferral({ data: { amount } }).then((res) => { if (res.error) toast.error(res.error); else { toast.success("Moved to your wallet"); load(); } })}>Transfer</Button>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="font-extrabold">Referral history</h2>
        {(card?.history || []).map((row) => (
          <article key={row.id} className="mt-3 border-t border-line pt-3 text-sm">
            <p className="font-bold">{row.label}</p>
            <p className="text-muted">{when(row.createdAt)} · {row.status} · {row.reward ? naira(row.reward) : "No reward yet"}{row.rewardedAt ? ` · ${when(row.rewardedAt)}` : ""}</p>
          </article>
        ))}
        {!card?.history.length ? <p className="mt-2 text-sm text-muted">No referrals yet.</p> : null}
      </section>
    </div>
  );
}
