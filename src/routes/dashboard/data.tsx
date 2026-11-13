import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { isLive } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/dashboard/data")({ component: DataPage });

const ORDER = ["MTN", "Airtel", "Glo", "9mobile", "Smile"];
const TONE: Record<string, string> = {
  MTN: "bg-mtn text-ink",
  Airtel: "bg-airtel text-on-primary",
  Glo: "bg-glo text-ink",
  "9mobile": "bg-nine text-on-primary",
  Smile: "bg-smile text-ink",
  Other: "bg-deep text-on-deep",
};

function DataPage() {
  const products = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const buy = useStore((s) => s.buy);
  const plans = products.filter((p) => p.category === "data" && isLive(p, providers));
  const present = [...ORDER.filter((n) => plans.some((p) => p.network === n)), ...(plans.some((p) => !p.network || !ORDER.includes(p.network)) ? ["Other"] : [])];
  const [net, setNet] = useState(present[0] || "MTN");
  const [phone, setPhone] = useState("");
  const [q, setQ] = useState("");
  const shown = plans.filter((p) => (net === "Other" ? !ORDER.includes(p.network) : p.network === net) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));

  const purchase = async (id: string) => {
    if (phone.trim().length < 8) return toast.error("Enter the phone number that should receive the data.");
    const err = await buy(id, { phone });
    if (err) toast.error(err);
    else toast.success("Data order placed");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Data</h1>
        <p className="text-sm text-muted">Each SIM network is its own list. A plan only shows under the network it was imported with.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {present.map((n) => (
          <button key={n} type="button" onClick={() => setNet(n)} className={`rounded-card border p-3 text-left ${net === n ? "border-primary ring-2 ring-primary/30" : "border-line bg-card"}`}>
            <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${TONE[n] || TONE.Other}`}>{n}</span>
            <p className="mt-2 text-sm font-semibold">{plans.filter((p) => (n === "Other" ? !ORDER.includes(p.network) : p.network === n)).length} plans</p>
          </button>
        ))}
      </div>
      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <Field label="Phone number"><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080…" /></Field>
        <input className={`${inputClass} mt-3`} placeholder={`Search ${net} plans`} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="scroll-pane mt-3 space-y-2 pr-1">
          {shown.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-3">
              <div>
                <p className="text-sm font-semibold">{p.name}</p>
                <p className="text-xs text-muted">{[p.network || "Untagged", p.validity, p.description].filter(Boolean).join(" · ")}</p>
              </div>
              <Button onClick={() => purchase(p.id)}>{naira(p.price)}</Button>
            </div>
          ))}
          {!shown.length ? <p className="py-6 text-sm text-muted">No live plans for this network. An admin can enable them from the catalogue.</p> : null}
        </div>
      </section>
    </div>
  );
}
