import { useMemo } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Hash, History, Megaphone, Radio, Receipt, Smartphone, Zap } from "lucide-react";
import { isLive, type Product } from "@/lib/catalog";
import { naira, when } from "@/lib/money";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/")({ component: DashHome });

const quick = [
  { to: "/dashboard/airtime", label: "Airtime", icon: Smartphone },
  { to: "/dashboard/data", label: "Data", icon: Radio },
  { to: "/dashboard/bills", label: "TV sub", icon: Receipt },
  { to: "/dashboard/bills", label: "Electricity", icon: Zap },
  { to: "/dashboard/numbers", label: "Buy number", icon: Hash },
  { to: "/dashboard/announcements", label: "Posts", icon: Megaphone },
  { to: "/dashboard/history", label: "History", icon: History },
  { to: "/community", label: "Channel", icon: Radio },
];

const shelves = [
  { to: "/dashboard/numbers", title: "Virtual numbers", body: "Pick a server, then a service and country." },
  { to: "/dashboard/data", title: "Data", body: "Plans stay split by network." },
  { to: "/dashboard/airtime", title: "Airtime", body: "Recharge from the same wallet." },
  { to: "/dashboard/bills", title: "Bills", body: "Cable, electricity and exam PINs." },
];

function shelfFor(product: Product) {
  if (product.category === "numbers") return "/dashboard/numbers";
  if (product.category === "data") return "/dashboard/data";
  if (product.category === "airtime") return "/dashboard/airtime";
  return "/dashboard/bills";
}

function DashHome() {
  const user = useUser();
  const products = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const allTxns = useStore((s) => s.txns);
  const session = useStore((s) => s.sessionUserId);
  const txns = useMemo(() => allTxns.filter((t) => t.userId === session), [allTxns, session]);
  const slides = useMemo(() => {
    const live = products.filter((p) => isLive(p, providers)).slice(0, 12);
    if (!live.length) return shelves.map((s) => ({ ...s, price: "" }));
    return live.map((p) => ({
      to: shelfFor(p),
      title: p.name,
      body: [p.network, p.country].filter(Boolean).join(" · ") || p.category,
      price: naira(p.price),
    }));
  }, [products, providers]);
  if (!user) return null;
  const loop = [...slides, ...slides];
  return (
    <div className="space-y-4 bg-white">
      <section className="rounded-card border border-line bg-white p-4 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold text-muted">Available balance</p>
            <p className="text-3xl font-extrabold text-ink">{naira(user.balance)}</p>
          </div>
          <Link to="/dashboard/wallet" className="btn-gradient rounded-full px-4 py-2 text-xs font-extrabold">Fund wallet</Link>
        </div>
      </section>

      <section className="marquee-wrap -mx-4">
        <div className="marquee px-4">
          {loop.map((slide, i) => (
            <Link key={slide.title + i} to={slide.to} className="promo-card flex w-72 shrink-0 flex-col justify-between">
              <span>
                <span className="block text-lg font-extrabold text-white">{slide.title}</span>
                <span className="mt-1 block text-sm font-medium text-white/80">{slide.body}</span>
              </span>
              <span className="mt-4 inline-flex w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold text-white">{slide.price || "Open"}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line bg-white p-4 shadow-card">
        <h2 className="text-lg font-extrabold">Quick services</h2>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {quick.map((q) => (
            <Link key={q.label} to={q.to} className="flex flex-col items-center gap-2 rounded-2xl bg-[#f3f0fb] px-1 py-3 text-center">
              <span className="grid size-10 place-items-center rounded-2xl bg-primary text-on-primary">
                <q.icon className="size-4" />
              </span>
              <span className="text-[11px] font-extrabold leading-tight">{q.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line bg-white p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">History</h2>
          <Link to="/dashboard/history" className="text-sm font-extrabold text-primary">View all</Link>
        </div>
        <div className="mt-3 space-y-2">
          {txns.slice(0, 4).map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-[#f3f0fb] px-3 py-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-primary text-on-primary"><Receipt className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold">{t.note}</p>
                <p className="text-xs font-medium text-muted">{when(t.createdAt)}</p>
              </span>
              <span className={`text-sm font-extrabold ${t.amount < 0 ? "text-danger" : "text-ok"}`}>{naira(t.amount)}</span>
            </div>
          ))}
          {!txns.length ? (
            <div className="flex items-center gap-3 rounded-2xl bg-[#f3f0fb] px-3 py-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-primary text-on-primary"><Receipt className="size-4" /></span>
              <span>
                <p className="text-sm font-extrabold">Transaction history</p>
                <p className="text-xs font-medium text-muted">Your recent transactions will appear here.</p>
              </span>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
