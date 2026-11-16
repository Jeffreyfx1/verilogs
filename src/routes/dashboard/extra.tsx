import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute, useRouterState } from "@tanstack/react-router";
import { Glyph, glyph } from "@/components/icons";
import { ProductSkeletons } from "@/components/product-skeletons";
import { BtnSpinner } from "@/components/ui";
import { toast } from "sonner";
import { isLive, type Product } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { beginPaystack, browseExtras } from "@/lib/shop-fns";
import { onShelf, type Shelf } from "@/lib/shelves";
import { withTimeout } from "@/lib/with-timeout";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/extra")({ component: ExtraPage });

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

const COPY: Record<Shelf, { title: string; body: string; empty: string }> = {
  vpn: {
    title: "VPN plans",
    body: "VPN plans stay on their own shelf. Random and SMM products never appear here.",
    empty: "No VPN plans yet. Import a VPN catalogue and turn the rows on.",
  },
  smm: {
    title: "SMM services",
    body: "Social services imported as SMM. VPN, numbers and random products stay off this shelf.",
    empty: "No SMM services yet. Import an SMM catalogue and turn the rows on.",
  },
  random: {
    title: "Random marketplace",
    body: "Miscellaneous products stored as category other. They do not mix into VPN, SMM, numbers or VTU.",
    empty: "No random products yet. Import a Random catalogue and turn the rows on.",
  },
};

export function Marketplace({ kind }: { kind: Shelf }) {
  const user = useUser();
  const all = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const buy = useStore((s) => s.buy);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [sort, setSort] = useState("popular");
  const [stockOnly, setStockOnly] = useState(false);
  const [qty, setQty] = useState(1);
  const [buying, setBuying] = useState("");
  const [paying, setPaying] = useState(false);
  const [open, setOpen] = useState<Product | null>(null);
  const [remote, setRemote] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    setPage(0);
    setRemote(null);
    setFailed(false);
    setMore(false);
    setOpen(null);
  }, [q, kind, attempt]);

  useEffect(() => {
    let stop = false;
    setWaiting(true);
    const timer = setTimeout(() => {
      withTimeout(browseExtras({ data: { q, kind, page } }))
        .then((res) => {
          if (stop) return;
          const rows = (res?.rows || []).filter((row) => onShelf(row.category, kind));
          setRemote((prev) => (page === 0 ? rows : [...(prev || []), ...rows]));
          setMore(!!res?.more);
          setFailed(false);
        })
        .catch(() => {
          if (stop) return;
          if (page === 0) {
            setFailed(true);
            setRemote([]);
          }
        })
        .finally(() => {
          if (!stop) setWaiting(false);
        });
    }, 200);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [q, kind, page, attempt]);

  const items = useMemo(() => {
    if (failed) {
      const needle = q.trim().toLowerCase();
      return all.filter((p) => {
        if (!isLive(p, providers) || !onShelf(p.category, kind)) return false;
        if (!needle) return true;
        return `${p.service} ${p.name} ${p.description} ${p.category} ${p.country} ${p.network}`.toLowerCase().includes(needle);
      }).slice(0, 40);
    }
    return (remote || []).filter((row) => onShelf(row.category, kind));
  }, [all, providers, q, remote, kind, failed]);

  const groups = useMemo(() => groupByWord(items), [items]);
  const picked = cat === "All" ? items : groups.find(([name]) => name === cat)?.[1] || [];
  const shown = useMemo(() => {
    const rows = stockOnly ? picked.filter((row) => row.stock > 0) : [...picked];
    rows.sort((a, b) => {
      if (sort === "price-asc") return a.price - b.price;
      if (sort === "price-desc") return b.price - a.price;
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.stock - a.stock || a.name.localeCompare(b.name);
    });
    return rows;
  }, [picked, sort, stockOnly]);

  const purchase = async (row: Product) => {
    if (buying || paying) return;
    const price = Math.round(row.price) * qty;
    if ((user?.balance || 0) < price) return;
    setBuying(row.id);
    let err: string | null = null;
    for (let i = 0; i < qty; i += 1) {
      err = await buy(row.id, {});
      if (err) break;
    }
    setBuying("");
    if (err) toast.error(err);
    else toast.success(qty > 1 ? `${qty} orders placed` : "Order placed");
  };

  const topUp = async (row: Product) => {
    if (paying || buying) return;
    const price = Math.round(row.price) * qty;
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

  const copy = COPY[kind];
  const loading = remote === null && !failed;

  return (
    <div className="-mx-3 min-h-full bg-[#EEF7FA] px-3 py-4 text-ink">
      <section className="rounded-[1.6rem] bg-gradient-to-br from-[#174C70] to-[#286D86] p-5 text-white shadow-[0_12px_28px_rgba(23,76,112,0.16)]">
        <p className="text-[11px] font-bold tracking-[0.14em] text-white/75">INSTANT DELIVERY</p>
        <h1 className="mt-1 text-2xl font-extrabold">{copy.title}</h1>
        <p className="mt-1 max-w-sm text-sm text-white/85">{copy.body}</p>
        <div className="mt-4 rounded-2xl bg-white/12 px-4 py-3">
          <p className="text-[11px] font-bold tracking-wide text-white/70">WALLET BALANCE</p>
          <p className="text-2xl font-extrabold">{naira(user?.balance || 0)}</p>
          <Link to="/dashboard/wallet" className="mt-1 inline-block text-sm font-bold underline">Fund wallet</Link>
        </div>
      </section>
      <input
        className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900"
        placeholder="Search by name"
        value={q}
        onChange={(e) => { setQ(e.target.value); setCat("All"); setOpen(null); }}
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base" value={cat} onChange={(e) => { setCat(e.target.value); setOpen(null); }}>
          <option value="All">All products</option>
          {groups.map(([name]) => <option key={name} value={name}>{name}</option>)}
        </select>
        <select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="popular">Most popular</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
          <option value="name">Name</option>
        </select>
      </div>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={stockOnly} onChange={(e) => setStockOnly(e.target.checked)} />
        In stock only
        <span className="ml-auto text-xs text-slate-500">{shown.length} products</span>
      </label>
      {open ? (
        <article className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <button type="button" className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-slate-700" onClick={() => { setOpen(null); setQty(1); }}>
            <Glyph icon={glyph.back} className="size-4" /> Back to products
          </button>
          <p className="text-xs font-bold uppercase tracking-wide text-[#0c6e8a]">{open.category || "Product"}</p>
          <h2 className="mt-1 text-xl font-extrabold leading-snug break-words">{open.name}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed break-words text-slate-700">{open.description || facts(open)}</p>
          <p className="mt-2 text-sm text-slate-600">{facts(open)}</p>
          <Checkout row={open} qty={qty} setQty={setQty} balance={user?.balance || 0} buying={buying === open.id} paying={paying} onBuy={() => void purchase(open)} onTopUp={() => void topUp(open)} />
        </article>
      ) : (
        <>
          {failed ? (
            <p className="mt-4 text-sm text-slate-600">
              The live shelf did not answer. Showing saved products.
              <button type="button" className="ml-2 font-extrabold text-[#174C70]" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
            </p>
          ) : null}
          {loading ? <ProductSkeletons /> : null}
          {!loading && !shown.length ? <p className="mt-6 text-sm text-slate-500">{copy.empty}</p> : null}
          <div className="mt-3 grid grid-cols-1 gap-3">
            {shown.map((row) => (
              <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-[11px] font-bold text-[#0c6e8a]">{row.category}{row.service ? ` · ${row.service}` : ""}</p>
                <p className="mt-1 text-sm font-extrabold leading-snug break-words text-slate-900">{row.name}</p>
                {row.description ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed break-words text-slate-600">{row.description.replace(/\s+/g, " ").trim()}</p> : <p className="mt-1 text-xs leading-relaxed break-words text-slate-600">{facts(row)}</p>}
                <p className="mt-2 text-xs font-bold text-emerald-700">{row.stock > 0 ? `${row.stock} in stock` : "Availability updates at checkout"}</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-lg font-extrabold">{row.price > 0 ? naira(row.price) : "Price not set"}</p>
                  <button type="button" className="btn-accent rounded-xl px-4 py-2 text-sm font-extrabold text-white" onClick={() => { setQty(1); setOpen(row); }}>
                    View & buy
                  </button>
                </div>
              </article>
            ))}
          </div>
          {more && !failed ? (
            <button type="button" disabled={waiting} className="btn-accent mt-4 w-full rounded-xl py-2.5 text-sm font-extrabold text-white disabled:opacity-60" onClick={() => setPage((n) => n + 1)}>
              {waiting ? <span className="inline-flex items-center justify-center gap-2"><BtnSpinner /> Loading more</span> : "Load more"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function Checkout({ row, qty, setQty, balance, buying, paying, onBuy, onTopUp }: { row: Product; qty: number; setQty: (n: number) => void; balance: number; buying: boolean; paying: boolean; onBuy: () => void; onTopUp: () => void }) {
  const unit = Math.round(row.price);
  const price = unit * qty;
  const short = price - balance;
  const cap = row.stock > 0 ? Math.min(row.stock, 20) : 20;
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Checkout</p>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" className="grid size-9 place-items-center rounded-xl bg-white text-lg font-bold" onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
        <span className="min-w-8 text-center text-base font-extrabold">{qty}</span>
        <button type="button" className="grid size-9 place-items-center rounded-xl bg-white text-lg font-bold" onClick={() => setQty(Math.min(cap, qty + 1))}>+</button>
        <span className="text-xs text-slate-500">{row.stock > 0 ? `${row.stock} available` : "1 per tap, up to 20"}</span>
      </div>
      <div className="mt-3 space-y-1 text-sm">
        <p className="flex justify-between"><span>Price each</span><span>{unit > 0 ? naira(unit) : "Not set"}</span></p>
        <p className="flex justify-between"><span>Quantity</span><span>× {qty}</span></p>
        <p className="flex justify-between text-base font-extrabold"><span>Total to pay</span><span>{unit > 0 ? naira(price) : "—"}</span></p>
        <p className="flex justify-between"><span>Wallet balance</span><span className="font-bold text-[#0c6e8a]">{naira(balance)}</span></p>
      </div>
      {row.validity ? <p className="mt-2 text-sm text-slate-600">Expires: {row.validity}</p> : null}
      {unit <= 0 ? <p className="mt-2 text-sm font-bold text-red-700">This product has no price yet.</p> : short > 0 ? (
        <>
          <p className="mt-2 rounded-xl bg-[#eef4ff] px-3 py-2 text-sm font-bold text-[#1e3a8a]">Your balance is {naira(short)} short. Fund your wallet to continue.</p>
          <button type="button" disabled={paying} className="btn-accent mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-extrabold text-white disabled:opacity-60" onClick={onTopUp}>
            {paying ? <BtnSpinner /> : null}
            {paying ? "Opening Paystack…" : `Top up ${naira(price)}`}
          </button>
        </>
      ) : (
        <button type="button" disabled={buying} className="btn-accent mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-extrabold text-white disabled:opacity-60" onClick={onBuy}>
          {buying ? <BtnSpinner /> : null}
          {buying ? "Buying…" : `Pay ${naira(price)} and get ${qty}`}
        </button>
      )}
    </div>
  );
}

function ExtraPage() {
  const hash = useRouterState({ select: (s) => s.location.hash });
  const kind: Shelf = String(hash || "").replace(/^#/, "") === "smm" ? "smm" : "random";
  return <Marketplace kind={kind} />;
}
