import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { naira, when } from "@/lib/money";
import { topupQuote } from "@/lib/catalog";
import { beginPaystack, confirmPaystack, hostStatus, purchasePreview } from "@/lib/shop-fns";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/wallet")({ component: WalletPage });

const PRESETS = [1000, 2000, 5000, 10000, 20000, 50000];

function WalletPage() {
  const user = useUser();
  const allTxns = useStore((s) => s.txns);
  const session = useStore((s) => s.sessionUserId);
  const settings = useStore((s) => s.settings);
  const adopt = useStore((s) => s.adopt);
  const buy = useStore((s) => s.buy);
  const txns = useMemo(() => allTxns.filter((t) => t.userId === session && t.kind === "topup"), [allTxns, session]);
  const [amount, setAmount] = useState(5000);
  const [custom, setCustom] = useState("");
  const [item, setItem] = useState("");
  const [productId, setProductId] = useState("");
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof purchasePreview>> | null>(null);
  const [paystack, setPaystack] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const due = Math.round(Number(params.get("amount")) || 0);
    const label = params.get("item") || "";
    const id = params.get("product") || "";
    const reference = params.get("reference") || params.get("trxref");
    if (due >= 100 && due <= 500000) {
      setCustom(String(due));
      setItem(label);
    }
    setProductId(id);
    hostStatus().then((s) => setPaystack(s.paystack)).catch(() => setPaystack(false));
    if (id) {
      purchasePreview({ data: { productId: id } })
        .then((res) => setPreview(res))
        .catch(() => setPreview({ error: "Could not open checkout." }));
    }
    if (!reference) return;
    confirmPaystack({ data: { reference } })
      .then((res) => {
        if ("state" in res && res.state) adopt(res.state);
        if ("error" in res && res.error) toast.error(res.error);
        else if ("bought" in res && res.bought) {
          toast.success("Paid. The number is in Active numbers.");
          window.location.href = "/dashboard/numbers";
          return;
        } else toast.success("Paystack confirmed the top up");
        window.history.replaceState({}, "", id ? `/dashboard/wallet?product=${encodeURIComponent(id)}` : "/dashboard/wallet");
      })
      .catch(() => toast.error("Could not confirm the Paystack payment."));
  }, [adopt]);
  if (!user) return null;
  const value = custom ? Number(custom) : amount;
  const quote = topupQuote(Number.isFinite(value) ? value : 0, settings || { paystackPercent: 0, paystackFlat: 0 });
  const pay = async () => {
    setBusy(true);
    try {
      const res = await beginPaystack({ data: { amount: value, productId } });
      if (res.error || !res.url) toast.error(res.error || "Paystack did not return a checkout link.");
      else window.location.href = res.url;
    } catch {
      toast.error("Could not start Paystack.");
    } finally {
      setBusy(false);
    }
  };
  const payFromWallet = async () => {
    setBusy(true);
    try {
      const err = await buy(productId, {});
      if (err) toast.error(err);
      else {
        toast.success("Number reserved. The code appears on the card.");
        window.location.href = "/dashboard/numbers";
      }
    } catch {
      toast.error("Could not place that order.");
    } finally {
      setBusy(false);
    }
  };
  if (productId) {
    const order = preview && preview.error == null && "price" in preview ? preview : null;
    return (
      <section className="mx-auto max-w-lg rounded-card border border-line bg-card p-5 shadow-card">
        <h1 className="text-2xl font-extrabold">Pay for this number</h1>
        {!order ? <p className="mt-3 text-sm text-muted">{preview?.error || "Opening checkout…"}</p> : (
          <>
            <p className="mt-2 text-sm text-muted">{[order.service, order.country].filter(Boolean).join(" · ")}</p>
            <p className="mt-1 font-semibold">{order.operator || order.name}</p>
            <p className="mt-4 text-3xl font-extrabold">{naira(order.price)}</p>
            <p className="mt-2 text-sm text-muted">Wallet balance {naira(order.balance)}.</p>
            {order.short > 0 ? (
              <>
                <p className="mt-3 text-sm font-extrabold text-danger">Insufficient balance. Top up your balance to make this purchase.</p>
                <p className="mt-1 text-sm text-muted">This number is {naira(order.price)}. Your wallet has {naira(order.balance)}.</p>
                <Button className="mt-4 w-full" onClick={() => { setProductId(""); setPreview(null); setItem(""); window.history.replaceState({}, "", "/dashboard/wallet"); }}>Top up balance</Button>
              </>
            ) : (
              <Button className="mt-4 w-full" disabled={busy} onClick={() => void payFromWallet()}>{busy ? "Reserving…" : `Pay ${naira(order.price)} from wallet`}</Button>
            )}
            {paystack === false ? <p className="mt-3 text-sm text-muted">Paystack is not connected on this host yet. Add PAYSTACK_SECRET_KEY in the host environment.</p> : null}
          </>
        )}
      </section>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <h1 className="text-2xl font-extrabold">{item ? "Pay for this number" : "Fund wallet"}</h1>
        <p className="mt-1 text-sm text-muted">Balance {naira(user.balance)}. Paystack adds the wallet amount after the charge succeeds. The site charge is not added to the wallet.</p>
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
          {busy ? "Opening Paystack…" : item ? `Pay ${naira(quote.pay)} for this number` : `Pay ${naira(quote.pay)} with Paystack`}
        </Button>
        {quote.fee > 0 ? <p className="mt-2 text-sm text-muted">Wallet receives {naira(quote.credit)}. Site charge {naira(quote.fee)}.</p> : null}
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
