import { useMemo } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Hash, History, Megaphone, Radio, Receipt, Smartphone, Wallet, Zap } from "lucide-react";
import { PromoBanners } from "@/components/promos";
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

function DashHome() {
  const user = useUser();
  const allOrders = useStore((s) => s.orders);
  const allTxns = useStore((s) => s.txns);
  const session = useStore((s) => s.sessionUserId);
  const orders = useMemo(() => allOrders.filter((o) => o.userId === session), [allOrders, session]);
  const txns = useMemo(() => allTxns.filter((t) => t.userId === session), [allTxns, session]);
  if (!user) return null;
  const first = user.name.split(" ")[0] || "there";
  const otp = orders.filter((o) => o.category === "numbers" && (o.status === "received" || o.status === "completed")).length;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Welcome, {first}</h1>
        <p className="text-sm font-medium text-muted">Numbers, data, airtime and bills in one wallet.</p>
      </div>

      <section className="balance-card rounded-card p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-extrabold tracking-wide text-white/75">Available balance</p>
          <Link to="/dashboard/wallet" className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-extrabold text-white">Fund wallet</Link>
        </div>
        <p className="mt-3 text-4xl font-extrabold text-white">{naira(user.balance)}</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            ["Codes", String(otp)],
            ["Wallet", "Active"],
            ["Level", "Tier 1"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-white/10 px-2 py-3 text-center">
              <p className="text-[11px] font-bold text-white/70">{k}</p>
              <p className="mt-1 text-sm font-extrabold text-white">{v}</p>
            </div>
          ))}
        </div>
      </section>

      <Link to="/dashboard/profile" className="promo-card block">
        <p className="text-xs font-extrabold text-white/70">Tier 1</p>
        <p className="mt-1 text-lg font-extrabold text-white">Your account is ready</p>
        <p className="mt-1 text-sm font-medium text-white/75">Update your name and phone from profile, then fund the wallet.</p>
      </Link>

      <PromoBanners />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Quick services</h2>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {quick.map((q) => (
            <Link key={q.label} to={q.to} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-card px-1 py-3 text-center shadow-card">
              <span className="grid size-10 place-items-center rounded-2xl bg-primary text-on-primary">
                <q.icon className="size-4" />
              </span>
              <span className="text-[11px] font-extrabold leading-tight">{q.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">History</h2>
          <Link to="/dashboard/history" className="text-sm font-extrabold text-primary">View all</Link>
        </div>
        <div className="mt-3 space-y-2">
          {txns.slice(0, 4).map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-paper px-3 py-3">
              <span className="grid size-10 place-items-center rounded-2xl bg-primary text-on-primary"><Receipt className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold">{t.note}</p>
                <p className="text-xs font-medium text-muted">{when(t.createdAt)}</p>
              </span>
              <span className={`text-sm font-extrabold ${t.amount < 0 ? "text-danger" : "text-ok"}`}>{naira(t.amount)}</span>
            </div>
          ))}
          {!txns.length ? <p className="py-3 text-sm font-medium text-muted">Your recent transactions will appear here.</p> : null}
        </div>
      </section>
    </div>
  );
}
