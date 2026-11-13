import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { naira, when } from "@/lib/money";
import { beginPaystack, confirmPaystack, hostStatus } from "@/lib/shop-fns";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/wallet")({ component: WalletPage });

const PRESETS = [1000, 2000, 5000, 10000, 20000, 50000];

function WalletPage() {
  const user = useUser();
  const allTxns = useStore((s) => s.txns);
  const session = useStore((s) => s.sessionUserId);
  const adopt = useStore((s) => s.adopt);
  const txns = useMemo(() => allTxns.filter((t) => t.userId === session && t.kind === "topup"), [allTxns, session]);
  const [amount, setAmount] = useState(5000);
  const [custom, setCustom] = useState("");
  const [paystack, setPaystack] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    hostStatus().then((s) => setPaystack(s.paystack)).catch(() => setPaystack(false));
    const reference = new URLSearchParams(window.location.search).get("reference") || new URLSearchParams(window.location.search).get("trxref");
    if (!reference) return;
    confirmPaystack({ data: { reference } })
      .then((res) => {
        if ("error" in res && res.error) toast.error(res.error);
        else if ("state" in res && res.state) {
          adopt(res.state);
          toast.success("Paystack confirmed the top up");
        }
        window.history.replaceState({}, "", "/dashboard/wallet");
      })
      .catch(() => toast.error("Could not confirm the Paystack payment."));
  }, [adopt]);
  if (!user) return null;
  const value = custom ? Number(custom) : amount;
  const pay = async () => {
    setBusy(true);
    try {
      const res = await beginPaystack({ data: { amount: value } });
      if (res.error || !res.url) toast.error(res.error || "Paystack did not return a checkout link.");
      else window.location.href = res.url;
    } catch {
      toast.error("Could not start Paystack.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <h1 className="text-2xl font-extrabold">Fund wallet</h1>
        <p className="mt-1 text-sm text-muted">Balance {naira(user.balance)}. Paystack adds the naira after the charge succeeds.</p>
        <div className="preset-grid mt-4 grid grid-cols-3 gap-2">
          {PRESETS.map((n) => (
            <button key={n} type="button" onClick={() => { setAmount(n); setCustom(""); }} className={`min-h-11 rounded-xl border px-2 py-3 text-sm font-semibold ${!custom && amount === n ? "border-primary bg-paper text-primary" : "border-line"}`}>
              {naira(n)}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <Field label="Custom amount" hint="Between ₦100 and ₦500,000">
            <input className={inputClass} inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, ""))} placeholder="Other amount" />
          </Field>
        </div>
        <Button className="mt-4 w-full" disabled={busy || paystack === false} onClick={() => void pay()}>
          {busy ? "Opening Paystack…" : `Pay ${naira(Number.isFinite(value) ? value : 0)} with Paystack`}
        </Button>
        {paystack === false ? (
          <p className="mt-3 text-sm text-muted">
            Paystack is not connected on this host yet. Add PAYSTACK_SECRET_KEY in the host environment, then this button charges for real. An admin can credit a wallet from Customers until then.
          </p>
        ) : null}
      </section>
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <h2 className="font-bold">Top up history</h2>
        <div className="scroll-pane mt-3 divide-y divide-line">
          {txns.map((t) => (
            <div key={t.id} className="flex justify-between py-2 text-sm">
              <span>{when(t.createdAt)}<br /><span className="text-xs text-muted">{t.note}</span></span>
              <span className="font-semibold text-ok">{naira(t.amount)}</span>
            </div>
          ))}
          {!txns.length ? <p className="py-6 text-sm text-muted">No top ups yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
