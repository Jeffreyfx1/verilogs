import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, Crown, FileText, Hash, History, MessageCircle, Play, Radio, Smartphone, Tv, Users, Zap } from "lucide-react";
import { when } from "@/lib/money";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/")({ component: DashHome });

const ukSearch = { server: "", country: "United Kingdom", kind: "", service: "WhatsApp" } as const;
const buySearch = { server: "", country: "", kind: "", service: "" } as const;
const rentSearch = { server: "", country: "", kind: "rent", service: "" } as const;

const quick = [
  { to: "/dashboard/airtime", label: "Airtime", icon: Smartphone, popular: true },
  { to: "/dashboard/data", label: "Data", icon: Radio, popular: true },
  { to: "/dashboard/bills", label: "TV Sub", icon: Tv },
  { to: "/dashboard/bills", label: "Electricity", icon: Zap },
  { to: "/dashboard/numbers", label: "Buy Number", icon: FileText, search: buySearch },
  { to: "/dashboard/history", label: "Buy Logs", icon: Hash },
  { to: "/dashboard/numbers", label: "Rent Number", icon: Crown, search: rentSearch },
  { to: "/dashboard/announcements", label: "Posts", icon: MessageCircle },
  { to: "/faq", label: "Tutorials", icon: Play },
  { to: "/dashboard/profile", label: "Refer", icon: Users },
  { to: "/community", label: "Channel", icon: MessageCircle },
] as const;

function PhoneArt() {
  return (
    <div className="tier-photo relative h-40 w-[37%] shrink-0 overflow-hidden rounded-2xl">
      <img
        src="https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=700&q=90"
        alt="Smartphone"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#10051f]/80 via-transparent to-violet-500/20" />
      <div className="absolute bottom-3 left-2 flex gap-1.5">
        <span className="text-lg">🇺🇸</span>
        <span className="text-lg">🇬🇧</span>
        <span className="text-lg">🇨🇦</span>
      </div>
      <div className="absolute inset-0 rounded-2xl border border-violet-300/50" />
    </div>
  );
}

function DashHome() {
  const user = useUser();
  const allTxns = useStore((s) => s.txns);
  const session = useStore((s) => s.sessionUserId);
  const txns = useMemo(() => allTxns.filter((t) => t.userId === session), [allTxns, session]);
  const latestTxn = txns[0];
  const [open, setOpen] = useState(true);
  if (!user) return null;
  const tiles = open ? quick : quick.slice(0, 8);
  return (
    <div className="min-w-0 space-y-5 pb-4">
      <section className="tier-card rise relative overflow-hidden rounded-[1.7rem] p-4">
        <div className="pointer-events-none absolute -left-8 -top-10 size-36 rounded-full bg-fuchsia-500/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-8 bottom-0 size-36 rounded-full bg-violet-500/30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <PhoneArt />
          <div className="relative z-10 min-w-0 flex-1">
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-violet-300/40 bg-[#16052f]/80 px-2 py-1 text-[10px] font-extrabold">
                <Crown className="size-3 text-violet-300" />
                Tier 1 / 3
              </span>
              <Link to="/dashboard/wallet" className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-[10px] font-extrabold shadow-[0_0_18px_#9333ea]">
                Upgrade
                <ArrowRight className="size-3" />
              </Link>
            </div>
            <h2 className="mt-4 text-xl font-extrabold leading-tight">
              Upgrade to <span className="text-violet-300 drop-shadow-[0_0_10px_#a855f7]">Tier 2</span>
            </h2>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-white/85">Get more features, higher limits and better rates.</p>
            <Link to="/dashboard/wallet" className="mt-4 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 px-3 py-2.5 text-xs font-extrabold shadow-[0_0_22px_#9333ea]">
              <Zap className="size-4 text-violet-200" />
              Upgrade Now
            </Link>
          </div>
        </div>
      </section>

      <Link to="/dashboard/numbers" search={ukSearch} className="uk-card relative flex min-h-[10.5rem] items-center gap-3 overflow-hidden rounded-[1.5rem] p-4">
        <img
          src="https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1000&q=90"
          alt="London skyline"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#10051f] via-[#1b0842]/90 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#10051f]/60 to-transparent" />
        <span className="relative z-10 grid size-14 shrink-0 place-items-center rounded-2xl border border-violet-300/30 bg-violet-700/90 text-white shadow-[0_0_25px_#9333ea]">
          <Zap className="size-8" />
        </span>
        <span className="relative z-10 min-w-0 flex-1 pb-5">
          <span className="block text-xl font-extrabold drop-shadow-lg">Cheap UK Line</span>
          <span className="mt-1 block text-sm font-semibold leading-relaxed text-white/90">Fast UK numbers for verification at the best rates.</span>
          <span className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2 text-xs font-extrabold shadow-[0_0_20px_#9333ea]">
            Buy Now
            <ArrowRight className="size-4" />
          </span>
        </span>
      </Link>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <span className="text-2xl text-violet-400">▦</span>
            Quick Services
          </h2>
          <button type="button" className="flex items-center gap-1 text-sm font-extrabold text-violet-400" onClick={() => setOpen((v) => !v)}>
            {open ? "See less" : "See all"}
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2.5">
          {tiles.map((q) => (
            <Link key={q.label} to={q.to} search={"search" in q ? q.search : undefined} className="service-card relative flex min-h-[6.2rem] flex-col items-center justify-center gap-2 rounded-2xl border border-fuchsia-500/50 bg-[#1b0b32] px-1 py-3 text-center shadow-[0_0_16px_#7c3aed33,inset_0_0_15px_#6d28d933]">
              {"popular" in q && q.popular ? <span className="popular-badge absolute -top-2 right-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold text-white">Popular</span> : null}
              <span className="grid size-11 place-items-center rounded-xl bg-violet-600/30 text-fuchsia-400 shadow-[0_0_15px_#a855f744]">
                <q.icon className="size-7" strokeWidth={2.5} />
              </span>
              <span className="text-[11px] font-extrabold leading-tight text-white">{q.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="history-card rounded-[1.5rem] p-3">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <History className="size-6 text-fuchsia-400" />
            History
          </h2>
          <Link to="/dashboard/history" className="flex items-center gap-1 text-sm font-extrabold text-violet-400">
            View All
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <Link to="/dashboard/history" hash="deposits" className="mt-4 flex items-center gap-3 rounded-2xl border border-violet-500/40 bg-[#210d45]/90 px-3 py-3 shadow-[inset_0_0_20px_#7c3aed22]">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-[0_0_22px_#9333ea]">
            <History className="size-8" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold">Transaction History</span>
            <span className="mt-1 block truncate text-xs font-medium text-white/70">{latestTxn ? latestTxn.note : "Your recent transactions will appear here."}</span>
            {latestTxn ? <span className="mt-2 block text-[10px] text-violet-300/70">{when(latestTxn.createdAt)}</span> : null}
          </span>
          <ChevronRight className="size-6 shrink-0 text-fuchsia-400" />
        </Link>
      </section>
    </div>
  );
}
