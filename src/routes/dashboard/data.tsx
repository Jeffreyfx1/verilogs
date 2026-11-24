import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import type { Product } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { listShelf } from "@/lib/shop-fns";
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

function planSize(name: string, network: string) {
  const trimmed = name.trim();
  const prefix = network ? `${network} ` : "";
  if (prefix && trimmed.toLowerCase().startsWith(prefix.toLowerCase())) return trimmed.slice(prefix.length).trim();
  return trimmed;
}

function isSize(value: string) {
  return /\d+(?:\.\d+)?\s?(?:gb|mb|tb)\b/i.test(value);
}

function planType(product: Product) {
  const service = product.service.trim();
  if (!service || isSize(service) || /^\d+$/.test(service)) return "";
  const size = planSize(product.name, product.network);
  if (service.toLowerCase() === size.toLowerCase()) return "";
  if (service.toLowerCase() === product.name.trim().toLowerCase()) return "";
  return service;
}

function networksOf(plans: Product[]) {
  const have = new Set(plans.map((item) => item.network).filter(Boolean));
  const extras = [...have].filter((name) => !ORDER.includes(name)).sort((a, b) => a.localeCompare(b));
  return [...ORDER.filter((name) => have.has(name)), ...extras];
}

function DataPage() {
  const buy = useStore((s) => s.buy);
  const nav = useNavigate();
  const [plans, setPlans] = useState<Product[]>([]);
  const [phone, setPhone] = useState("");
  const [q, setQ] = useState("");
  const [buying, setBuying] = useState("");
  const [ready, setReady] = useState(false);
  const [net, setNet] = useState("");
  const [kind, setKind] = useState("All");
  useEffect(() => {
    let stop = false;
    listShelf({ data: { category: "data" } })
      .then((rows) => { if (!stop) setPlans(rows || []); })
      .catch(() => { if (!stop) setPlans([]); })
      .finally(() => { if (!stop) setReady(true); });
    return () => { stop = true; };
  }, []);
  const networks = networksOf(plans);
  const selected = networks.includes(net) ? net : networks[0] || "";
  const mine = plans.filter((item) => item.network === selected);
  const types = [...new Set(mine.map(planType).filter(Boolean))];
  const showTypes = types.length > 1;
  const activeKind = types.includes(kind) ? kind : "All";
  const needle = q.trim().toLowerCase();
  const shown = mine.filter((item) => {
    if (showTypes && activeKind !== "All" && planType(item) !== activeKind) return false;
    if (!needle) return true;
    return `${item.name} ${planSize(item.name, item.network)} ${item.validity} ${planType(item)}`.toLowerCase().includes(needle);
  });

  const purchase = async (id: string) => {
    if (buying) return;
    if (phone.trim().length < 8) return toast.error("Enter the phone number that should receive the data.");
    setBuying(id);
    const res = await buy(id, { phone });
    setBuying("");
    if (res.error) toast.error(res.error);
    else if (res.orderId) nav({ to: "/purchase-result/$orderId", params: { orderId: res.orderId } });
    else toast.success("Data order placed");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Data</h1>
        <p className="text-sm text-muted">Pick a network, then a plan.</p>
      </div>
      {!ready ? <p className="text-sm text-muted">Loading plans…</p> : !networks.length ? <p className="text-sm text-muted">No products available yet. Please check back later.</p> : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {networks.map((name) => (
              <button key={name} type="button" onClick={() => { setNet(name); setKind("All"); }} className={`rounded-card border p-3 text-left ${selected === name ? "border-primary ring-2 ring-primary/30" : "border-line bg-card"}`}>
                <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-bold ${TONE[name] || TONE.Other}`}>{name}</span>
                <p className="mt-2 text-sm font-semibold">{plans.filter((item) => item.network === name).length} plans</p>
              </button>
            ))}
          </div>
          <section className="rounded-card border border-line bg-card p-4 shadow-card">
            <Field label="Phone number"><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="080…" /></Field>
            {showTypes ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {["All", ...types].map((type) => (
                  <button key={type} type="button" onClick={() => setKind(type)} className={`rounded-lg border px-2 py-1 text-xs font-semibold ${activeKind === type ? "border-primary" : "border-line bg-paper"}`}>{type}</button>
                ))}
              </div>
            ) : null}
            <input className={`${inputClass} mt-3`} placeholder={`Search ${selected} plans`} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="scroll-pane mt-3 space-y-2 pr-1">
              {shown.map((item) => {
                const size = planSize(item.name, item.network);
                const type = planType(item);
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper px-3 py-3">
                    <div>
                      <p className="text-sm font-semibold">{item.name}</p>
                      <p className="text-xs text-muted">{[size !== item.name ? size : "", type, item.validity].filter(Boolean).join(" · ")}</p>
                    </div>
                    <Button busy={buying === item.id} disabled={!!buying} onClick={() => void purchase(item.id)}>{naira(item.price)}</Button>
                  </div>
                );
              })}
              {!shown.length ? <p className="py-6 text-sm text-muted">No products available yet. Please check back later.</p> : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
