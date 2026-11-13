import { useMemo } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Hash, Radio, Smartphone, Receipt, Wallet } from "lucide-react";
import { naira } from "@/lib/money";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/")({ component: DashHome });

const quick = [
  { to: "/dashboard/airtime", label: "Airtime", icon: Smartphone },
  { to: "/dashboard/data", label: "Data", icon: Radio },
  { to: "/dashboard/bills", label: "Cable", icon: Receipt },
  { to: "/dashboard/bills", label: "Electricity", icon: Receipt },
  { to: "/dashboard/numbers", label: "Buy number", icon: Hash },
  { to: "/dashboard/wallet", label: "Fund wallet", icon: Wallet },
  { to: "/dashboard/history", label: "History", icon: Receipt },
  { to: "/community", label: "Community", icon: Hash },
];

function DashHome() {
  const user = useUser();
  const allOrders = useStore((s) => s.orders);
  const allTxns = useStore((s) => s.txns);
  const session = useStore((s) => s.sessionUserId);
  const orders = useMemo(() => allOrders.filter((o) => o.userId === session), [allOrders, session]);
  const txns = useMemo(() => allTxns.filter((t) => t.userId === session), [allTxns, session]);
  const announcements = useStore((s) => s.announcements);
  if (!user) return null;
  const otp = orders.filter((o) => o.category === "numbers" && (o.status === "received" || o.status === "completed")).length;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Welcome back</h1>
          <p className="text-sm text-muted">Wallet, bills, numbers and verification in one place.</p>
        </div>
        <span className="rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold">Tier 1 account</span>
      </div>
      <section className="balance-card rounded-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wide text-on-deep/80">Available balance</p>
            <p className="mt-2 text-4xl font-extrabold">{naira(user.balance)}</p>
          </div>
          <Link to="/dashboard/wallet" className="rounded-xl bg-card/15 px-3 py-2 text-sm font-semibold text-on-deep">Fund wallet</Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ["Codes received", String(otp)],
            ["Wallet", naira(user.balance)],
            ["Level", "Tier 1"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-deep/25 px-3 py-3">
              <p className="text-xs text-on-deep/70">{k}</p>
              <p className="font-bold">{v}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["/dashboard/numbers", "Virtual numbers", "Pick a server, then a service and country."],
          ["/dashboard/data", "Data", "Plans stay split by MTN, Airtel, Glo, 9mobile and Smile."],
          ["/dashboard/airtime", "Airtime", "Recharge the same networks from the wallet."],
          ["/dashboard/bills", "Bills", "Cable, electricity and exam PINs."],
        ].map(([to, t, b]) => (
          <Link key={t} to={to} className="rounded-card bg-primary p-4 text-on-primary shadow-card">
            <p className="font-bold">{t}</p>
            <p className="mt-1 text-xs text-on-primary/80">{b}</p>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-card border border-line bg-card p-4 shadow-card lg:col-span-2">
          <h2 className="font-bold">Quick services</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {quick.map((q) => (
              <Link key={q.label} to={q.to} className="flex flex-col items-center gap-2 rounded-xl bg-paper px-2 py-4 text-center text-xs font-semibold">
                <q.icon className="size-5 text-primary" />
                {q.label}
              </Link>
            ))}
          </div>
        </section>
        <section className="rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="font-bold">Announcements</h2>
          <div className="mt-3 space-y-2">
            {announcements.slice(0, 3).map((a) => (
              <Link key={a.id} to="/dashboard/announcements" className="block rounded-xl bg-paper px-3 py-2">
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="text-xs text-muted">{a.body}</p>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Recent activity</h2>
          <Link to="/dashboard/history" className="text-sm font-semibold text-primary">View all</Link>
        </div>
        <div className="mt-3 divide-y divide-line">
          {txns.slice(0, 5).map((t) => (
            <div key={t.id} className="flex justify-between py-2 text-sm">
              <span>{t.note}</span>
              <span className={t.amount < 0 ? "text-danger" : "text-ok"}>{naira(t.amount)}</span>
            </div>
          ))}
          {!txns.length ? <p className="py-4 text-sm text-muted">Nothing yet. Fund the wallet to start.</p> : null}
        </div>
      </section>
    </div>
  );
}
