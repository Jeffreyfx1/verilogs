import { useMemo } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Hash, History, Megaphone, Radio, Receipt, Smartphone, Zap } from "lucide-react";
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
  const settings = useStore((s) => s.settings);
  const allTxns = useStore((s) => s.txns);
  const session = useStore((s) => s.sessionUserId);
  const txns = useMemo(() => allTxns.filter((t) => t.userId === session), [allTxns, session]);
  const slides = settings.banners.length
    ? settings.banners
    : [
        { id: "numbers", title: "Virtual numbers", body: "Pick a server, then a service and country.", href: "/dashboard/numbers" },
        { id: "data", title: "Data and airtime", body: "Plans stay split by SIM network.", href: "/dashboard/data" },
        { id: "bills", title: "Bills", body: "Cable, electricity and exam PINs.", href: "/dashboard/bills" },
      ];
  if (!user) return null;
  return (
    <div className="min-w-0 space-y-4">
      <section className="rounded-card border border-line bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold text-muted">Available balance</p>
            <p className="text-3xl font-extrabold text-ink">{naira(user.balance)}</p>
          </div>
          <Link to="/dashboard/wallet" className="btn-gradient rounded-full px-4 py-2 text-xs font-extrabold">Fund wallet</Link>
        </div>
      </section>

      <section className="min-w-0 overflow-hidden">
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1">
          {slides.map((slide) => (
            <a key={slide.id} href={slide.href} className="promo-card w-[85%] max-w-sm shrink-0 snap-start">
              <span className="block text-lg font-extrabold text-white">{slide.title}</span>
              <span className="mt-1 block text-sm font-medium text-white/80">{slide.body}</span>
            </a>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-extrabold">Quick services</h2>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {quick.map((q) => (
            <Link key={q.label} to={q.to} className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-card px-1 py-3 text-center">
              <span className="grid size-10 place-items-center rounded-2xl bg-primary/25 text-primary">
                <q.icon className="size-4" />
              </span>
              <span className="text-[11px] font-extrabold leading-tight">{q.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-card border border-line bg-card p-4">
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
          {!txns.length ? (
            <div className="flex items-center gap-3 rounded-2xl bg-paper px-3 py-3">
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