import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { inputClass } from "@/components/ui";
import { isLive, type Product } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { browseExtras } from "@/lib/shop-fns";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/extra")({ component: ExtraPage });

const KNOWN = new Set(["numbers", "rent", "airtime", "data", "cable", "electricity", "exam"]);
const SKIP = new Set(["the", "and", "for", "with", "from", "your", "this", "that", "service", "services", "other", "default", "item", "items", "product", "products", "buy", "new", "premium", "basic", "pro", "plan", "plans", "account", "accounts", "order", "pack", "more", "all", "get", "top", "best", "cheap", "fast"]);

function wordsOf(item: Product) {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of `${item.service} ${item.name}`.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || SKIP.has(raw) || /^\d+$/.test(raw) || seen.has(raw)) continue;
    seen.add(raw);
    words.push(raw);
  }
  return words;
}

function labelOf(word: string) {
  if (word === "vpn" || word === "smm" || word === "sms") return word.toUpperCase();
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function groupByWord(items: Product[]) {
  const freq = new Map<string, number>();
  const perItem = items.map(wordsOf);
  for (const words of perItem) for (const word of words) freq.set(word, (freq.get(word) || 0) + 1);
  const groups = new Map<string, Product[]>();
  items.forEach((item, index) => {
    const words = perItem[index];
    const shared = words.filter((word) => (freq.get(word) || 0) > 1);
    const pool = shared.length ? shared : words;
    const pick = [...pool].sort((a, b) => (freq.get(b) || 0) - (freq.get(a) || 0) || a.localeCompare(b))[0] || item.category || "other";
    const key = labelOf(pick);
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function ExtraPage() {
  const user = useUser();
  const all = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const buy = useStore((s) => s.buy);
  const [q, setQ] = useState("");
  const [buying, setBuying] = useState("");
  const [open, setOpen] = useState("");
  const [shown, setShown] = useState(12);
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
  const groups = useMemo(() => groupByWord(items), [items]);
  const active = groups.find(([name]) => name === open)?.[1] || groups[0]?.[1] || [];
  const activeName = groups.find(([name]) => name === open)?.[0] || groups[0]?.[0] || "";

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
      <h1 className="flex items-center gap-2 text-2xl font-extrabold text-white">
        <LayoutGrid className="size-6 text-violet-300" />
        More services
      </h1>
      <p className="text-sm text-white/70">Services that share a word sit in one category. Five House rows become one House grid.</p>
      <input className={inputClass} placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setShown(12); }} />
      {!groups.length ? <p className="text-sm text-white/60">No extra services yet. Import an API and turn the rows on.</p> : null}
      <div className="grid grid-cols-2 gap-2.5">
        {groups.map(([name, rows]) => (
          <button
            key={name}
            type="button"
            onClick={() => { setOpen(name); setShown(12); }}
            className={`service-card flex min-h-[5.4rem] flex-col items-start justify-between rounded-2xl p-3 text-left ${activeName === name ? "border-fuchsia-300" : ""}`}
          >
            <span className="text-sm font-extrabold text-white">{name}</span>
            <span className="text-xs font-bold text-violet-200">{rows.length} related</span>
          </button>
        ))}
      </div>
      {activeName ? (
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-white">{activeName}</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {active.slice(0, shown).map((row) => (
              <article key={row.id} className="service-card flex min-h-[8.5rem] flex-col rounded-2xl p-3">
                <p className="line-clamp-3 text-sm font-bold leading-snug text-white">{row.name}</p>
                <p className="mt-1 text-[11px] text-violet-200">{row.country || row.network || row.category}</p>
                <p className="mt-auto pt-3 text-sm font-extrabold text-white">{row.price > 0 ? naira(row.price) : "Set amount"}</p>
                <button type="button" disabled={buying === row.id} className="mt-2 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-extrabold text-white disabled:opacity-60" onClick={() => void purchase(row.id, row.price)}>
                  {buying === row.id ? "Buying" : "Buy"}
                </button>
              </article>
            ))}
          </div>
          {active.length > shown ? (
            <button type="button" className="w-full rounded-2xl border border-violet-400/40 py-2 text-sm font-bold text-fuchsia-300" onClick={() => setShown((n) => n + 12)}>
              Show more {activeName}
            </button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
