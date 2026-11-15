import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { isLive, markupFor, withMargin } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/dashboard/airtime")({ component: AirtimePage });

const TONE: Record<string, string> = {
  MTN: "bg-mtn text-ink",
  Airtel: "bg-airtel text-on-primary",
  Glo: "bg-glo text-ink",
  "9mobile": "bg-nine text-on-primary",
  Smile: "bg-smile text-ink",
};

function AirtimePage() {
  const all = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const products = useMemo(() => all.filter((p) => p.category === "airtime" && isLive(p, providers)), [all, providers]);
  const buy = useStore((s) => s.buy);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("500");
  const [net, setNet] = useState(products[0]?.network || "MTN");
  const current = products.find((p) => p.network === net) || products[0];
  const provider = providers.find((item) => item.id === current?.providerId);
  const face = Number(amount) || 0;
  const charge = withMargin(face, provider ? markupFor(provider, current?.operator || "") : 1);
  const purchase = async () => {
    if (!current) return;
    if (phone.trim().length < 8) return toast.error("Enter the phone number.");
    const err = await buy(current.id, { phone, amount: face });
    if (err) toast.error(err);
    else toast.success("Airtime sent");
  };
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-2xl font-extrabold">Airtime</h1>
      <p className="text-sm text-muted">The SIM receives the amount you type. Your wallet pays that amount with this server's margin.</p>
      <div className="grid grid-cols-2 gap-2">
        {products.map((p) => (
          <button key={p.id} type="button" onClick={() => setNet(p.network)} className={`rounded-card border p-4 text-left ${current?.id === p.id ? "border-primary" : "border-line bg-card"}`}>
            <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${TONE[p.network] || "bg-deep text-on-deep"}`}>{p.network || "Network"}</span>
            <p className="mt-2 text-sm font-semibold">{p.name}</p>
          </button>
        ))}
      </div>
      <Field label="Phone number"><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080…" /></Field>
      <Field label="Amount" hint="₦50 to ₦50,000"><input className={inputClass} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} /></Field>
      <Button className="w-full" disabled={!current} onClick={purchase}>Recharge {current ? naira(charge) : ""}</Button>
    </div>
  );
}
