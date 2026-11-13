import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { isLive, type Product } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/dashboard/bills")({ component: BillsPage });

const TABS = [
  { id: "cable", label: "Cable TV" },
  { id: "electricity", label: "Electricity" },
  { id: "exam", label: "Exam PINs" },
  { id: "giftcard", label: "Gift cards" },
  { id: "betting", label: "Betting" },
] as const;

function BillsPage() {
  const all = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const products = useMemo(() => all.filter((p) => isLive(p, providers)), [all, providers]);
  const buy = useStore((s) => s.buy);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("cable");
  const [phone, setPhone] = useState("");
  const [detail, setDetail] = useState("");
  const [amount, setAmount] = useState("2000");
  const [q, setQ] = useState("");
  const list = products.filter((p) => p.category === tab && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const purchase = async (p: Product) => {
    if (phone.trim().length < 8 && tab !== "exam" && tab !== "giftcard") return toast.error("Enter a phone number.");
    const err = await buy(p.id, { phone, detail, amount: p.variable ? Number(amount) : undefined });
    if (err) toast.error(err);
    else toast.success("Order placed");
  };
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Bills</h1>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === t.id ? "bg-primary text-on-primary" : "border border-line bg-card"}`}>{t.label}</button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-card border border-line bg-card p-4 shadow-card lg:col-span-2">
          <input className={inputClass} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="scroll-pane mt-3 space-y-2 pr-1">
            {list.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-3">
                <div>
                  <p className="text-sm font-semibold">{p.name}</p>
                  <p className="text-xs text-muted">{p.description}</p>
                </div>
                <Button onClick={() => purchase(p)}>{p.variable ? "Pay" : naira(p.price)}</Button>
              </div>
            ))}
            {!list.length ? <p className="py-6 text-sm text-muted">Nothing live in this category.</p> : null}
          </div>
        </section>
        <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
          <Field label="Phone"><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label={tab === "cable" ? "Smartcard / IUC" : tab === "electricity" ? "Meter number" : "Note"}>
            <input className={inputClass} value={detail} onChange={(e) => setDetail(e.target.value)} />
          </Field>
          {tab === "electricity" ? (
            <Field label="Amount"><input className={inputClass} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} /></Field>
          ) : null}
        </section>
      </div>
    </div>
  );
}
