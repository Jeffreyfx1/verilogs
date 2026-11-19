import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import type { Product } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { profitsOf, sellQuote } from "@/lib/pricing";
import { listShelf } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/dashboard/airtime")({ component: AirtimePage });

const ORDER = ["MTN", "Airtel", "Glo", "9mobile"];
const PRESETS = [100, 200, 500, 1000, 2000, 5000];
const TONE: Record<string, string> = {
  MTN: "bg-mtn text-ink",
  Airtel: "bg-airtel text-on-primary",
  Glo: "bg-glo text-ink",
  "9mobile": "bg-nine text-on-primary",
  Smile: "bg-smile text-ink",
};

function networkNames(products: Product[]) {
  const have = new Set(products.map((item) => item.network).filter(Boolean));
  const extras = [...have].filter((name) => !ORDER.includes(name)).sort((a, b) => a.localeCompare(b));
  return [...ORDER, ...extras];
}

function AirtimePage() {
  const buy = useStore((s) => s.buy);
  const settings = useStore((s) => s.settings);
  const [products, setProducts] = useState<Product[]>([]);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("500");
  const [net, setNet] = useState("MTN");
  const [typeId, setTypeId] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stop = false;
    listShelf({ data: { category: "airtime" } })
      .then((rows) => { if (!stop) setProducts(rows || []); })
      .catch(() => { if (!stop) setProducts([]); });
    return () => { stop = true; };
  }, []);
  const names = networkNames(products);
  const selected = products.some((item) => item.network === net) ? net : names.find((name) => products.some((item) => item.network === name)) || "";
  const rows = products.filter((item) => item.network === selected);
  const typed = rows.filter((item) => item.service && item.service.toLowerCase() !== "airtime");
  const current = typed.length > 1 ? typed.find((item) => item.id === typeId) || typed[0] : rows.find((item) => item.service.toLowerCase() === "airtime") || rows[0];
  const face = Number(amount) || 0;
  const quote = sellQuote({
    category: "airtime",
    unitCost: 0,
    currency: "NGN",
    usdRate: 1,
    variable: true,
    face,
    profits: profitsOf({ general: settings.generalProfit, airtime: settings.airtimeProfit, data: settings.dataProfit }),
  });
  const charge = quote.ok ? quote.charge : 0;
  const purchase = async () => {
    if (!current || busy) return;
    if (phone.trim().length < 8) return toast.error("Enter the phone number.");
    if (face < 50 || face > 50000) return toast.error("Airtime must be between ₦50 and ₦50,000.");
    setBusy(true);
    const err = await buy(current.id, { phone, amount: face });
    setBusy(false);
    if (err) toast.error(err);
    else toast.success("Airtime sent");
  };
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-extrabold">Airtime</h1>
      <p className="text-sm text-muted">Pick a network, enter the phone number, then choose the amount the SIM should receive.</p>
      {!products.length ? <p className="text-sm text-muted">No products available yet. Please check back later.</p> : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {names.map((name) => {
              const ready = products.some((item) => item.network === name);
              return (
                <button
                  key={name}
                  type="button"
                  disabled={!ready}
                  onClick={() => { setNet(name); setTypeId(""); }}
                  className={`rounded-card border p-4 text-left ${ready ? selected === name ? "border-primary" : "border-line bg-card" : "cursor-not-allowed border-line bg-card opacity-60"}`}
                >
                  <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${TONE[name] || "bg-deep text-on-deep"}`}>{name}</span>
                  <p className="mt-2 text-sm font-semibold">{ready ? "Available" : "Not available"}</p>
                </button>
              );
            })}
          </div>
          {typed.length > 1 ? (
            <div className="grid grid-cols-2 gap-2">
              {typed.map((item) => (
                <button key={item.id} type="button" onClick={() => setTypeId(item.id)} className={`rounded-card border px-3 py-2 text-left text-sm font-semibold ${current?.id === item.id ? "border-primary" : "border-line bg-card"}`}>
                  {item.service}
                </button>
              ))}
            </div>
          ) : null}
          <Field label="Phone number"><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080…" /></Field>
          <Field label="Amount" hint="₦50 to ₦50,000"><input className={inputClass} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} /></Field>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((preset) => (
              <button key={preset} type="button" onClick={() => setAmount(String(preset))} className={`rounded-xl border px-3 py-2 text-sm font-semibold ${face === preset ? "border-primary bg-card" : "border-line bg-card"}`}>
                {naira(preset)}
              </button>
            ))}
          </div>
          <p className="text-sm text-muted">{quote.ok ? `The SIM receives ${naira(face)}. Your wallet pays ${naira(charge)}.` : "Enter an amount between ₦50 and ₦50,000."}</p>
          <Button className="w-full" busy={busy} disabled={!current || face < 50 || face > 50000} onClick={() => void purchase()}>{busy ? "Sending…" : `Recharge ${naira(face)}`}</Button>
        </>
      )}
    </div>
  );
}
