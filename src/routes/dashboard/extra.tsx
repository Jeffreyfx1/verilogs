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

const LOG_GROUPS = ["TikTok", "Facebook", "Instagram", "YouTube", "X (Twitter)", "Telegram", "Other"];
const SMM_GROUPS = ["Instagram", "TikTok", "YouTube", "Facebook", "X (Twitter)", "Telegram", "Snapchat", "Twitch", "Audiomack", "Other"];
const DELAYS = [0, 5, 10, 15, 30, 60, 90];

function facts(row: Product) {
  return [row.subcategory, row.category, row.service, row.country, row.network, row.operator, row.validity, row.stock > 0 ? `${row.stock} in stock` : ""].filter(Boolean).join(" · ");
}

function groupsFor(kind: Shelf, extra: string[]) {
  const base = kind === "smm" ? SMM_GROUPS : LOG_GROUPS;
  const more = extra.filter((name) => name && !base.includes(name));
  return ["All", ...base, ...more];
}

function smmKind(row: Product) {
  return (row.smmType || "").trim().toLowerCase();
}

function commentLines(text: string) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
}

function orderTotal(row: Product, qty: number, comments: string, span: number, posts: number) {
  const unit = Math.round(row.price);
  const kind = smmKind(row);
  if (row.category !== "smm") return { units: qty, price: unit * qty };
  if (kind === "package") return { units: 1, price: unit };
  if (kind === "custom comments") {
    const lines = commentLines(comments);
    return { units: lines, price: unit * lines };
  }
  if (kind.includes("subscription")) {
    const units = Math.max(0, span) * Math.max(0, posts);
    return { units, price: unit * units };
  }
  return { units: qty, price: unit * qty };
}

const COPY: Record<Shelf, { title: string; body: string; empty: string }> = {
  vpn: {
    title: "VPN plans",
    body: "VPN is coming soon.",
    empty: "VPN is coming soon.",
  },
  smm: {
    title: "SMM services",
    body: "Social and marketing services.",
    empty: "No products available yet. Please check back later.",
  },
  random: {
    title: "Buy logs",
    body: "Logs grouped by platform.",
    empty: "No products available yet. Please check back later.",
  },
};

export function Marketplace({ kind }: { kind: Shelf }) {
  const user = useUser();
  const all = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const buy = useStore((s) => s.buy);
  const settings = useStore((s) => s.settings);
  const [q, setQ] = useState("");
  const [sub, setSub] = useState("All");
  const [sort, setSort] = useState("popular");
  const [stockOnly, setStockOnly] = useState(false);
  const [qty, setQty] = useState(1);
  const [link, setLink] = useState("");
  const [comments, setComments] = useState("");
  const [username, setUsername] = useState("");
  const [smin, setSmin] = useState("");
  const [smax, setSmax] = useState("");
  const [posts, setPosts] = useState("");
  const [delay, setDelay] = useState("0");
  const [answer, setAnswer] = useState("");
  const [buying, setBuying] = useState("");
  const [paying, setPaying] = useState(false);
  const [open, setOpen] = useState<Product | null>(null);
  const [remote, setRemote] = useState<Product[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState(false);
  const [after, setAfter] = useState("");
  const [nextAfter, setNextAfter] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const options = groupsFor(kind, settings.marketplaceSubcategories || []);

  useEffect(() => {
    setAfter("");
    setNextAfter("");
    setRemote(null);
    setFailed(false);
    setMore(false);
    setOpen(null);
    setSub("All");
    setQ("");
  }, [kind]);

  useEffect(() => {
    let stop = false;
    setWaiting(true);
    const timer = setTimeout(() => {
      withTimeout(browseExtras({ data: { q, kind, subcategory: sub === "All" ? "" : sub, after } }))
        .then((res) => {
          if (stop) return;
          const rows = (res?.rows || []).filter((row) => onShelf(row.category, kind));
          setRemote((prev) => (after ? [...(prev || []), ...rows] : rows));
          setMore(!!res?.more);
          setNextAfter(res?.next || "");
          setFailed(false);
        })
        .catch(() => {
          if (stop) return;
          if (!after) {
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
  }, [q, kind, after, attempt, sub]);

  const items = useMemo(() => {
    if (failed) {
      const needle = q.trim().toLowerCase();
      return all.filter((p) => {
        if (!isLive(p, providers) || !onShelf(p.category, kind)) return false;
        if (sub !== "All" && (p.subcategory || "") !== sub) return false;
        if (!needle) return true;
        return `${p.service} ${p.name} ${p.description} ${p.category} ${p.country} ${p.network}`.toLowerCase().includes(needle);
      }).slice(0, 40);
    }
    return (remote || []).filter((row) => onShelf(row.category, kind));
  }, [all, providers, q, remote, kind, failed, sub]);

  const shown = useMemo(() => {
    const rows = stockOnly ? items.filter((row) => row.stock > 0) : [...items];
    rows.sort((a, b) => {
      if (sort === "price-asc") return a.price - b.price;
      if (sort === "price-desc") return b.price - a.price;
      if (sort === "name") return a.name.localeCompare(b.name);
      return b.stock - a.stock || a.name.localeCompare(b.name);
    });
    return rows;
  }, [items, sort, stockOnly]);

  const openRow = (row: Product) => {
    const floor = row.category === "smm" && row.smmMin && row.smmMin > 0 ? row.smmMin : 1;
    setQty(floor);
    setLink("");
    setComments("");
    setUsername("");
    setSmin(row.smmMin ? String(row.smmMin) : "");
    setSmax(row.smmMax ? String(row.smmMax) : "");
    setPosts("");
    setDelay("0");
    setAnswer("");
    setOpen(row);
  };

  const purchase = async (row: Product) => {
    if (buying || paying) return;
    const detail = row.category === "smm"
      ? JSON.stringify({
        link,
        comments,
        username,
        min: Number(smin) || 0,
        max: Number(smax) || 0,
        posts: Number(posts) || 0,
        delay: Number(delay) || 0,
        answerNumber: answer,
        quantity: qty,
      })
      : "";
    const total = orderTotal(row, qty, comments, Number(smax) || 0, Number(posts) || 0).price;
    if ((user?.balance || 0) < total) return;
    setBuying(row.id);
    let err: string | null = null;
    if (row.category === "smm") err = await buy(row.id, { amount: qty, detail });
    else {
      for (let i = 0; i < qty; i += 1) {
        err = await buy(row.id, {});
        if (err) break;
      }
    }
    setBuying("");
    if (err) toast.error(err);
    else {
      toast.success(qty > 1 && row.category !== "smm" ? `${qty} orders placed` : "Order placed");
      setOpen(null);
    }
  };

  const topUp = async (row: Product) => {
    if (paying || buying) return;
    const price = orderTotal(row, qty, comments, Number(smax) || 0, Number(posts) || 0).price;
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
        onChange={(e) => { setQ(e.target.value); setAfter(""); setNextAfter(""); setRemote(null); setOpen(null); }}
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base" value={sub} onChange={(e) => { setSub(e.target.value); setAfter(""); setNextAfter(""); setRemote(null); setOpen(null); }}>
          {options.map((name) => <option key={name} value={name}>{name === "All" ? "All categories" : name}</option>)}
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
          <p className="text-xs font-bold uppercase tracking-wide text-[#0c6e8a]">{[open.subcategory, open.category || "Product"].filter(Boolean).join(" · ")}</p>
          <h2 className="mt-1 text-xl font-extrabold leading-snug break-words">{open.name}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed break-words text-slate-700">{open.description || facts(open)}</p>
          <p className="mt-2 text-sm text-slate-600">{facts(open)}</p>
          <Checkout
            row={open}
            qty={qty}
            setQty={setQty}
            balance={user?.balance || 0}
            buying={buying === open.id}
            paying={paying}
            link={link}
            setLink={setLink}
            comments={comments}
            setComments={setComments}
            username={username}
            setUsername={setUsername}
            smin={smin}
            setSmin={setSmin}
            smax={smax}
            setSmax={setSmax}
            posts={posts}
            setPosts={setPosts}
            delay={delay}
            setDelay={setDelay}
            answer={answer}
            setAnswer={setAnswer}
            onBuy={() => void purchase(open)}
            onTopUp={() => void topUp(open)}
          />
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
                <p className="text-[11px] font-bold text-[#0c6e8a]">{[row.subcategory, row.category, row.service].filter(Boolean).join(" · ")}</p>
                <p className="mt-1 text-sm font-extrabold leading-snug break-words text-slate-900">{row.name}</p>
                {row.description ? <p className="mt-1 line-clamp-2 text-xs leading-relaxed break-words text-slate-600">{row.description.replace(/\s+/g, " ").trim()}</p> : <p className="mt-1 text-xs leading-relaxed break-words text-slate-600">{facts(row)}</p>}
                <p className="mt-2 text-xs font-bold text-emerald-700">{row.stock > 0 ? `${row.stock} in stock` : "Availability updates at checkout"}</p>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-lg font-extrabold">{row.price > 0 ? naira(row.price) : "Price not set"}</p>
                  <button type="button" className="btn-accent rounded-xl px-4 py-2 text-sm font-extrabold text-white" onClick={() => openRow(row)}>
                    View & buy
                  </button>
                </div>
              </article>
            ))}
          </div>
          {more && !failed ? (
            <button type="button" disabled={waiting || !nextAfter} className="btn-accent mt-4 w-full rounded-xl py-2.5 text-sm font-extrabold text-white disabled:opacity-60" onClick={() => { if (nextAfter) setAfter(nextAfter); }}>
              {waiting ? <span className="inline-flex items-center justify-center gap-2"><BtnSpinner /> Loading more</span> : "Load more"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function Checkout(props: {
  row: Product;
  qty: number;
  setQty: (n: number) => void;
  balance: number;
  buying: boolean;
  paying: boolean;
  link: string;
  setLink: (value: string) => void;
  comments: string;
  setComments: (value: string) => void;
  username: string;
  setUsername: (value: string) => void;
  smin: string;
  setSmin: (value: string) => void;
  smax: string;
  setSmax: (value: string) => void;
  posts: string;
  setPosts: (value: string) => void;
  delay: string;
  setDelay: (value: string) => void;
  answer: string;
  setAnswer: (value: string) => void;
  onBuy: () => void;
  onTopUp: () => void;
}) {
  const { row, qty, setQty, balance, buying, paying, onBuy, onTopUp } = props;
  const smm = row.category === "smm";
  const kind = smmKind(row);
  const total = orderTotal(row, qty, props.comments, Number(props.smax) || 0, Number(props.posts) || 0);
  const unit = Math.round(row.price);
  const short = total.price - balance;
  const floor = smm && row.smmMin && row.smmMin > 0 ? row.smmMin : 1;
  const cap = smm ? (row.smmMax && row.smmMax > 0 ? row.smmMax : 100000) : row.stock > 0 ? Math.min(row.stock, 20) : 20;
  const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-base text-slate-900";
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Checkout</p>
      {smm && kind !== "subscriptions" && kind !== "subscription" ? (
        <label className="mt-2 block text-xs font-semibold text-slate-600">
          Link
          <input className={`${field} mt-1`} value={props.link} onChange={(e) => props.setLink(e.target.value)} placeholder="https://" />
        </label>
      ) : null}
      {smm && kind === "custom comments" ? (
        <label className="mt-2 block text-xs font-semibold text-slate-600">
          Comments, one per line
          <textarea className={`${field} mt-1`} rows={4} value={props.comments} onChange={(e) => props.setComments(e.target.value)} />
        </label>
      ) : null}
      {smm && kind === "poll" ? (
        <label className="mt-2 block text-xs font-semibold text-slate-600">
          Answer number
          <input className={`${field} mt-1`} inputMode="numeric" value={props.answer} onChange={(e) => props.setAnswer(e.target.value.replace(/[^\d]/g, ""))} />
        </label>
      ) : null}
      {smm && (kind === "subscriptions" || kind === "subscription") ? (
        <div className="mt-2 grid gap-2">
          <label className="text-xs font-semibold text-slate-600">Username<input className={`${field} mt-1`} value={props.username} onChange={(e) => props.setUsername(e.target.value)} /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-600">Min<input className={`${field} mt-1`} inputMode="numeric" value={props.smin} onChange={(e) => props.setSmin(e.target.value.replace(/[^\d]/g, ""))} /></label>
            <label className="text-xs font-semibold text-slate-600">Max<input className={`${field} mt-1`} inputMode="numeric" value={props.smax} onChange={(e) => props.setSmax(e.target.value.replace(/[^\d]/g, ""))} /></label>
          </div>
          <label className="text-xs font-semibold text-slate-600">New posts<input className={`${field} mt-1`} inputMode="numeric" value={props.posts} onChange={(e) => props.setPosts(e.target.value.replace(/[^\d]/g, ""))} /></label>
          <label className="text-xs font-semibold text-slate-600">
            Delay (minutes)
            <select className={`${field} mt-1`} value={props.delay} onChange={(e) => props.setDelay(e.target.value)}>
              {DELAYS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>
      ) : null}
      {smm && (kind === "package" || kind === "custom comments" || kind.includes("subscription")) ? null : (
        <div className="mt-2 flex items-center gap-2">
          <button type="button" className="grid size-9 place-items-center rounded-xl bg-white text-lg font-bold" onClick={() => setQty(Math.max(floor, qty - 1))}>−</button>
          <span className="min-w-8 text-center text-base font-extrabold">{qty}</span>
          <button type="button" className="grid size-9 place-items-center rounded-xl bg-white text-lg font-bold" onClick={() => setQty(Math.min(cap, qty + 1))}>+</button>
          <span className="text-xs text-slate-500">{smm ? `${floor}–${cap}` : row.stock > 0 ? `${row.stock} available` : "1 per tap, up to 20"}</span>
        </div>
      )}
      <div className="mt-3 space-y-1 text-sm">
        <p className="flex justify-between"><span>{smm && kind !== "package" ? "Price per unit" : "Price each"}</span><span>{unit > 0 ? naira(unit) : "Not set"}</span></p>
        <p className="flex justify-between"><span>Quantity</span><span>× {total.units}</span></p>
        <p className="flex justify-between text-base font-extrabold"><span>Total to pay</span><span>{unit > 0 && total.price > 0 ? naira(total.price) : "—"}</span></p>
        <p className="flex justify-between"><span>Wallet balance</span><span className="font-bold text-[#0c6e8a]">{naira(balance)}</span></p>
      </div>
      {smm && kind !== "package" ? <p className="mt-2 text-xs text-slate-500">The provider rate is per 1,000, except a package. The wallet is charged for the quantity you send.</p> : null}
      {row.smmRefill ? <p className="mt-1 text-xs font-semibold text-emerald-700">Refill is available after this order.</p> : null}
      {unit <= 0 || total.price <= 0 ? <p className="mt-2 text-sm font-bold text-red-700">This product has no price yet.</p> : short > 0 ? (
        <>
          <p className="mt-2 rounded-xl bg-[#eef4ff] px-3 py-2 text-sm font-bold text-[#1e3a8a]">Your balance is {naira(short)} short. Fund your wallet to continue.</p>
          <button type="button" disabled={paying || buying} className="btn-accent mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-extrabold text-white disabled:opacity-60" onClick={onTopUp}>
            {paying ? <BtnSpinner /> : null}
            {paying ? "Opening Paystack…" : `Top up ${naira(total.price)}`}
          </button>
        </>
      ) : (
        <button type="button" disabled={buying || paying} className="btn-accent mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-extrabold text-white disabled:opacity-60" onClick={onBuy}>
          {buying ? <BtnSpinner /> : null}
          {buying ? "Buying…" : `Pay ${naira(total.price)}`}
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
