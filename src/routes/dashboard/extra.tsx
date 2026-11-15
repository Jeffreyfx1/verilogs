import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { isLive, type Product } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { beginPaystack, browseExtras } from "@/lib/shop-fns";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/extra")({ component: ExtraPage });

const KNOWN = new Set(["numbers", "rent", "airtime", "data", "cable", "electricity", "exam"]);
const SKIP = new Set(["the", "and", "for", "with", "from", "your", "this", "that", "service", "services", "other", "default", "item", "items", "product", "products", "buy", "new", "premium", "basic", "pro", "plan", "plans", "account", "accounts", "order", "pack", "more", "all", "get", "top", "best", "cheap", "fast"]);

function wordsOf(item: Product) {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of `${item.service} ${item.name} ${item.category}`.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || SKIP.has(raw) || /^\d+$/.test(raw) || seen.has(raw)) continue;
    seen.add(raw);
    words.push(raw);
  }
  return words;
}

function labelOf(word: string) {
  if (word === "vpn" || word === "smm" || word === "sms" || word === "vtu") return word.toUpperCase();
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

function facts(row: Product) {
  return [row.category, row.service, row.country, row.network, row.operator, row.validity, row.stock > 0 ? `${row.stock} in stock` : ""].filter(Boolean).join(" · ");
}

function ExtraPage() {
  const user = useUser();
  const all = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const buy = useStore((s) => s.buy);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [buying, setBuying] = useState("");
  const [paying, setPaying] = useState(false);
  const [open, setOpen] = useState<Product | null>(null);
  const [remote, setRemote] = useState<Product[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#vpn") setQ("vpn");
  }, []);

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
    const needle = q.trim().toLowerCase();
    const local = all.filter((p) => {
      if (KNOWN.has(p.category) || seen.has(p.id) || !isLive(p, providers)) return false;
      if (!needle) return true;
      return `${p.service} ${p.name} ${p.description} ${p.category} ${p.country} ${p.network}`.toLowerCase().includes(needle);
    });
    return [...remote, ...local];
  }, [all, providers, q, remote]);

  const groups = useMemo(() => groupByWord(items), [items]);
  const shown = cat === "All" ? items : groups.find(([name]) => name === cat)?.[1] || [];

  const purchase = async (row: Product) => {
    const price = Math.round(row.price);
    if ((user?.balance || 0) < price) return;
    setBuying(row.id);
    const err = await buy(row.id, {});
    setBuying("");
    if (err) toast.error(err);
    else toast.success("Order placed");
  };

  const topUp = async (row: Product) => {
    const price = Math.round(row.price);
    if (price < 100) return toast.error("This product price is not ready for Paystack yet.");
    setPaying(true);
    try {
      const res = await beginPaystack({ data: { amount: price } });
      if (res.error || !res.url) toast.error(res.error || "Paystack did not open.");
      else window.location.href = res.url;
    } catch {
      toast.error("Could not start Paystack.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="-mx-3 min-h-full bg-white px-3 py-4 text-slate-900">
      <div className="market-marquee rounded-xl">
        <span className="px-4 text-sm font-bold">Please enable VPN for faster success rates. Please enable VPN for faster success rates.</span>
      </div>
      <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Marketplace</h1>
      <p className="mt-1 text-sm text-slate-600">Search a word such as house and the matching products stay together, with the full name and details.</p>
      <input
        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900"
        placeholder="Search products or a category"
        value={q}
        onChange={(e) => { setQ(e.target.value); setCat("All"); setOpen(null); }}
      />
      {open ? (
        <article className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <button type="button" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-slate-700" onClick={() => setOpen(null)}>
            <ArrowLeft className="size-4" /> Back to products
          </button>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{open.category || "Product"}</p>
          <h2 className="mt-1 text-xl font-extrabold leading-snug break-words">{open.name}</h2>
          <p className="mt-2 text-sm leading-relaxed break-words text-slate-700">{facts(open)}</p>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed break-words text-slate-800">{open.description || "The supplier did not send a longer description. The name and attributes above are the full product information on file."}</p>
          <Checkout row={open} balance={user?.balance || 0} buying={buying === open.id} paying={paying} onBuy={() => void purchase(open)} onTopUp={() => void topUp(open)} />
        </article>
      ) : (
        <>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {["All", ...groups.map(([name]) => name)].map((name) => (
              <button key={name} type="button" onClick={() => setCat(name)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${cat === name ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
                {name}
              </button>
            ))}
          </div>
          {!shown.length ? <p className="mt-6 text-sm text-slate-500">No products yet. Import a catalogue and turn the rows on.</p> : null}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shown.map((row) => (
              <article key={row.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-sm">
                <button type="button" className="text-left" onClick={() => setOpen(row)}>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{row.category}</p>
                  <p className="mt-1 text-sm font-bold leading-snug break-words text-slate-900">{row.name}</p>
                  <p className="mt-1 text-xs leading-relaxed break-words text-slate-600">{facts(row)}</p>
                  {row.description ? <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed break-words text-slate-700">{row.description}</p> : null}
                </button>
                <p className="mt-3 text-base font-extrabold">{row.price > 0 ? naira(row.price) : "Price not set"}</p>
                <button type="button" className="mt-2 w-full rounded-xl bg-slate-900 py-2 text-xs font-extrabold text-white" onClick={() => setOpen(row)}>
                  Buy
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Checkout({ row, balance, buying, paying, onBuy, onTopUp }: { row: Product; balance: number; buying: boolean; paying: boolean; onBuy: () => void; onTopUp: () => void }) {
  const price = Math.round(row.price);
  const short = price - balance;
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Checkout</p>
      <p className="mt-1 text-sm font-semibold break-words">{row.name} · 1x</p>
      {row.validity ? <p className="mt-1 text-sm text-slate-600">Expires: {row.validity}</p> : null}
      <p className="mt-2 text-lg font-extrabold">{price > 0 ? naira(price) : "Price not set"}</p>
      <p className="text-sm text-slate-600">Wallet balance {naira(balance)}</p>
      {price <= 0 ? <p className="mt-2 text-sm font-bold text-red-700">This product has no price yet.</p> : short > 0 ? (
        <>
          <p className="mt-2 text-sm font-bold text-red-700">Please top up to make this purchase. You are {naira(short)} short.</p>
          <button type="button" disabled={paying} className="mt-3 w-full rounded-xl bg-red-700 py-2.5 text-sm font-extrabold text-white disabled:opacity-60" onClick={onTopUp}>
            {paying ? "Opening Paystack…" : `Top up ${naira(price)}`}
          </button>
        </>
      ) : (
        <button type="button" disabled={buying} className="mt-3 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-extrabold text-white disabled:opacity-60" onClick={onBuy}>
          {buying ? "Buying…" : `Pay ${naira(price)}`}
        </button>
      )}
    </div>
  );
}
