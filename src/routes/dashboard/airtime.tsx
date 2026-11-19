import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import type { AirtimeOffer } from "@/lib/airtime";
import { airtimeCharge } from "@/lib/airtime";
import { naira } from "@/lib/money";
import { listAirtimeOffers } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/dashboard/airtime")({ component: AirtimePage });

const TONE: Record<string, string> = {
  mtn: "bg-mtn text-ink",
  airtel: "bg-airtel text-on-primary",
  glo: "bg-glo text-ink",
  "9mobile": "bg-nine text-on-primary",
};

function AirtimePage() {
  const buyAirtime = useStore((s) => s.buyAirtime);
  const [offers, setOffers] = useState<AirtimeOffer[]>([]);
  const [ready, setReady] = useState(false);
  const [networkId, setNetworkId] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("500");
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stop = false;
    listAirtimeOffers()
      .then((res) => { if (!stop) setOffers(res.offers || []); })
      .catch(() => { if (!stop) setOffers([]); })
      .finally(() => { if (!stop) setReady(true); });
    return () => { stop = true; };
  }, []);
  const selected = offers.find((item) => item.id === networkId) || offers[0];
  const face = Number(amount) || 0;
  const quote = selected ? airtimeCharge(face, selected.profit) : null;
  const inRange = !!selected && face >= selected.minAmount && face <= selected.maxAmount;
  const presets = [100, 200, 500, 1000, 2000, 5000].filter((value) => selected && value >= selected.minAmount && value <= selected.maxAmount);
  const purchase = async () => {
    if (!selected || !quote?.ok || busy) return;
    setBusy(true);
    const err = await buyAirtime(selected.id, { phone: phone.trim(), amount: face });
    setBusy(false);
    if (err) toast.error(err);
    else {
      toast.success("Airtime sent");
      setReview(false);
    }
  };
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-extrabold">Airtime</h1>
      <p className="text-sm text-muted">Choose a network, enter the phone number and the amount the SIM should receive, then confirm the charge.</p>
      {!ready ? <p className="text-sm text-muted">Loading networks…</p> : !offers.length ? <p className="text-sm text-muted">No airtime networks are available yet.</p> : selected ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {offers.map((item) => (
              <button key={item.id} type="button" onClick={() => { setNetworkId(item.id); setReview(false); }} className={`rounded-card border p-4 text-left ${selected.id === item.id ? "border-primary" : "border-line bg-card"}`}>
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="mb-2 h-8 w-8 rounded-lg object-cover" /> : <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${TONE[item.brand] || "bg-deep text-on-deep"}`}>{item.name}</span>}
                <p className="mt-2 text-sm font-semibold">{item.name}</p>
              </button>
            ))}
          </div>
          <Field label="Phone number"><input className={inputClass} value={phone} onChange={(e) => { setPhone(e.target.value); setReview(false); }} placeholder="080…" /></Field>
          <Field label="Amount" hint={`${naira(selected.minAmount)} to ${naira(selected.maxAmount)}`}>
            <input className={inputClass} inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d]/g, "")); setReview(false); }} />
          </Field>
          {presets.length ? (
            <div className="grid grid-cols-3 gap-2">
              {presets.map((preset) => (
                <button key={preset} type="button" onClick={() => { setAmount(String(preset)); setReview(false); }} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${face === preset ? "border-primary bg-card" : "border-line bg-card"}`}>
                  {naira(preset)}
                </button>
              ))}
            </div>
          ) : null}
          <p className="text-sm text-muted">{quote?.ok && inRange ? `The SIM receives ${naira(face)}. Your wallet pays ${naira(quote.charge)}.` : `Enter an amount from ${naira(selected.minAmount)} to ${naira(selected.maxAmount)}.`}</p>
          {review && quote?.ok && inRange ? (
            <div className="space-y-3 rounded-card border border-line bg-card p-4">
              <p className="font-bold">Confirm airtime</p>
              <p className="text-sm">{selected.name} · {phone.trim()}</p>
              <p className="text-sm">Amount {naira(face)} · Charge {naira(quote.charge)}</p>
              <div className="flex gap-2">
                <Button tone="soft" onClick={() => setReview(false)}>Back</Button>
                <Button className="flex-1" busy={busy} onClick={() => void purchase()}>{busy ? "Sending…" : "Confirm"}</Button>
              </div>
            </div>
          ) : (
            <Button className="w-full" disabled={!inRange || phone.trim().length < 8} onClick={() => setReview(true)}>Review charge</Button>
          )}
        </>
      ) : null}
    </div>
  );
}
