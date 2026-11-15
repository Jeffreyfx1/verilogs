import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { inputClass } from "@/components/ui";
import { isLive, type Product } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { browseExtras } from "@/lib/shop-fns";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/extra")({ component: ExtraPage });

const KNOWN = new Set(["numbers", "rent", "airtime", "data", "cable", "electricity", "exam"]);

function ExtraPage() {
  const user = useUser();
  const all = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const buy = useStore((s) => s.buy);
  const [q, setQ] = useState("");
  const [buying, setBuying] = useState("");
  const [remote, setRemote] = useState<Product[]>([]);
  useEffect(() => {
    let stop = false;
    const timer = setTimeout(() => {
      browseExtras({ data: { q } })
        .then((rows) => {
          if (!stop) setRemote(rows);
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [q]);
  const items = useMemo(() => {
    const seen = new Set(remote.map((row) => row.id));
    const local = all.filter((p) => !KNOWN.has(p.category) && !seen.has(p.id) && isLive(p, providers) && (!q || `${p.service} ${p.name}`.toLowerCase().includes(q.toLowerCase())));
    return [...remote, ...local];
  }, [all, providers, q, remote]);
  const groups = [...items.reduce((map, item) => {
    const key = item.service || item.category || "Other";
    map.set(key, [...(map.get(key) || []), item]);
    return map;
  }, new Map<string, typeof items>())];

  const purchase = async (id: string, price: number) => {
    if ((user?.balance || 0) < price) return toast.error("Insufficient balance. Top up your balance to make this purchase.");
    setBuying(id);
    const err = await buy(id, {});
    setBuying("");
    if (err) toast.error(err);
    else toast.success("Order placed");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">More services</h1>
      <p className="text-sm text-muted">VPN, social boost and random imports show here, grouped by the category the API already uses. Numbers, airtime and data stay on their own pages.</p>
      <input className={inputClass} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      {!groups.length ? <p className="text-sm text-muted">No extra services yet. Import an API and turn the rows on.</p> : null}
      {groups.map(([name, rows]) => (
        <section key={name} className="rounded-2xl border border-line bg-card p-3">
          <h2 className="font-extrabold">{name}</h2>
          <div className="mt-2 space-y-2">
            {rows.slice(0, 40).map((row) => (
              <div key={row.id} className="flex items-center gap-3 rounded-xl bg-paper px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{row.name}</span>
                  <span className="text-xs text-muted">{row.country || row.network || row.category}</span>
                </span>
                <span className="text-sm font-extrabold">{naira(row.price)}</span>
                <button type="button" disabled={buying === row.id} className="rounded-xl bg-violet-700 px-3 py-1.5 text-xs font-extrabold text-white disabled:opacity-60" onClick={() => void purchase(row.id, row.price)}>Buy</button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
