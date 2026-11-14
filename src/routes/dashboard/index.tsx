import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Crown, FileText, Hash, History, Megaphone, MessageCircle, Play, Radio, Receipt, Send, Smartphone, Tv, Users, Wallet, Zap } from "lucide-react";
import { naira, when } from "@/lib/money";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/")({ component: DashHome });

const ukSearch = { server: "", country: "United Kingdom", kind: "", service: "WhatsApp" } as const;
const tgSearch = { server: "", country: "", kind: "", service: "Telegram" } as const;

const quick = [
  { to: "/dashboard/airtime", label: "Airtime", icon: Smartphone, popular: true },
  { to: "/dashboard/data", label: "Data", icon: Radio, popular: true },
  { to: "/dashboard/bills", label: "TV Sub", icon: Tv },
  { to: "/dashboard/bills", label: "Electricity", icon: Zap },
  { to: "/dashboard/numbers", label: "Telegram", icon: Send, search: tgSearch },
  { to: "/dashboard/numbers", label: "Buy Number", icon: FileText },
  { to: "/dashboard/history", label: "Buy Logs", icon: Hash },
  { to: "/dashboard/announcements", label: "Posts", icon: Megaphone },
  { to: "/faq", label: "Tutorials", icon: Play },
  { to: "/dashboard/profile", label: "Refer", icon: Users },
  { to: "/community", label: "Channel", icon: MessageCircle },
] as const;

function PhoneArt() {
  return (
    <div className="relative h-40 w-32 shrink-0">
      <span className="orbit-ring absolute left-1 top-6 h-28 w-32 rounded-[50%] border-[3px] border-cyan-300 shadow-[0_0_22px_#22d3ee,0_0_40px_#22d3ee] [transform:rotate(-18deg)]" />
      <div className="float-slow absolute left-2 top-2 h-[8.5rem] w-[4.6rem] -rotate-6 rounded-[1.35rem] border-[3px] border-violet-200 bg-gradient-to-b from-[#4c1d95] to-[#1e0b3a] shadow-[0_0_24px_#a855f7,0_16px_24px_rgba(0,0,0,.5)]">
        <span className="absolute left-1/2 top-1.5 h-1 w-7 -translate-x-1/2 rounded-full bg-white/50" />
        <span className="absolute left-1.5 top-7 grid h-12 w-[3.1rem] place-items-center rounded-2xl bg-gradient-to-b from-white to-violet-200 shadow-[0_0_18px_#e9d5ff]">
          <span className="flex gap-1">
            <span className="size-1.5 rounded-full bg-violet-700" />
            <span className="size-1.5 rounded-full bg-violet-700" />
            <span className="size-1.5 rounded-full bg-violet-700" />
          </span>
        </span>
      </div>
      <span className="absolute right-0 top-3 text-lg drop-shadow-[0_0_6px_#fff]">🇺🇸</span>
      <span className="absolute right-1 top-11 text-lg drop-shadow-[0_0_6px_#fff]">🇬🇧</span>
      <span className="absolute right-0 top-[4.6rem] text-lg drop-shadow-[0_0_6px_#fff]">🇨🇦</span>
    </div>
  );
}

function BigBen() {
  return (
    <svg viewBox="0 0 120 150" className="h-28 w-24 text-violet-300 drop-shadow-[0_0_18px_#c084fc]" aria-hidden="true">
      <path fill="currentColor" d="M52 6h16v10h10v14H42V16h10V6zm-16 28h48v78H36V34zm14 12h20v22H50V46zM28 116h64v10H28zm-10 14h84v8H18z" />
      <path fill="#1e0b3a" d="M56 52h8v10h-8z" />
      <path fill="currentColor" opacity=".45" d="M8 132h18l8-18 10 22 12-28 8 24h48v8H8z" />
    </svg>
  );
}

function DashHome() {
  const user = useUser();
  const allTxns = useStore((s) => s.txns);
  const session = useStore((s) => s.sessionUserId);
  const txns = useMemo(() => allTxns.filter((t) => t.userId === session), [allTxns, session]);
  const [open, setOpen] = useState(true);
  if (!user) return null;
  const tiles = open ? quick : quick.slice(0, 8);
  return (
    <div className="min-w-0 space-y-4">
      <section className="tier-card rise relative overflow-hidden rounded-[1.7rem] p-4">
        <div className="pointer-events-none absolute -left-8 -top-10 size-32 rounded-full bg-fuchsia-500/40 blur-2xl" />
        <div className="pointer-events-none absolute -right-6 bottom-0 size-28 rounded-full bg-cyan-400/30 blur-2xl" />
        <div className="relative flex items-center gap-1">
          <PhoneArt />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/40 bg-black/40 px-2 py-1 text-[11px] font-extrabold shadow-[0_0_12px_#fbbf24]">
                <Crown className="size-3 text-amber-300" /> Tier 1 / 3
              </span>
              <Link to="/dashboard/wallet" className="rounded-full bg-violet-500 px-3 py-1 text-[11px] font-extrabold shadow-[0_0_16px_#a855f7]">Upgrade →</Link>
            </div>
            <h2 className="mt-3 text-[1.35rem] font-extrabold leading-tight drop-shadow-[0_0_12px_#c084fc]">Upgrade to <span className="text-amber-300 drop-shadow-[0_0_10px_#fbbf24]">Tier 2</span></h2>
            <p className="mt-1 text-sm font-semibold text-white/85">Get more features, higher limits and better rates.</p>
            <Link to="/dashboard/wallet" className="mt-3 inline-flex items-center gap-2 rounded-full bg-violet-500 px-5 py-2.5 text-sm font-extrabold shadow-[0_0_22px_#a855f7,0_8px_18px_#6d28d9]">
              <Zap className="size-4" /> Upgrade Now
            </Link>
          </div>
        </div>
      </section>

      <Link to="/dashboard/numbers" search={ukSearch} className="uk-card relative flex items-center gap-3 overflow-hidden rounded-[1.5rem] p-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-violet-500 text-white shadow-[0_0_22px_#a855f7]">
          <Zap className="size-7" />
        </span>
        <span className="relative z-10 min-w-0 flex-1 pr-16">
          <span className="block text-xl font-extrabold drop-shadow-[0_0_10px_#c084fc]">Cheap UK Line</span>
          <span className="mt-0.5 block text-sm font-semibold text-white/80">Fast UK numbers for verification at the best rates.</span>
          <span className="mt-2 inline-flex rounded-full bg-violet-500 px-4 py-1.5 text-xs font-extrabold shadow-[0_0_16px_#a855f7]">Buy Now</span>
        </span>
        <span className="pointer-events-none absolute -bottom-1 right-0 opacity-95"><BigBen /></span>
      </Link>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><span className="text-primary">▦</span> Quick Services</h2>
          <button type="button" className="text-sm font-extrabold text-primary" onClick={() => setOpen((v) => !v)}>{open ? "See less" : "See all"} →</button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2.5">
          {tiles.map((q) => (
            <Link key={q.label} to={q.to} search={"search" in q ? q.search : undefined} className="relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-fuchsia-400/70 bg-[#24104a] px-1 py-3 text-center shadow-[0_0_16px_#7c3aed66,inset_0_0_12px_#6d28d933]">
              {"popular" in q && q.popular ? <span className="absolute -top-2 rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] font-extrabold text-black">Popular</span> : null}
              <span className="grid size-11 place-items-center rounded-full bg-violet-500/50 text-white shadow-[0_0_14px_#a855f7]">
                <q.icon className="size-5" strokeWidth={2.4} />
              </span>
              <span className="text-[11px] font-extrabold leading-tight">{q.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><History className="size-4 text-primary" /> History</h2>
        <Link to="/dashboard/history" hash="deposits" className="flex items-center gap-3 rounded-2xl border border-line bg-card px-3 py-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-violet-600 text-white"><Wallet className="size-4" /></span>
          <span><span className="block text-sm font-extrabold">Deposit history</span><span className="text-xs text-muted">Wallet deposits</span></span>
        </Link>
        <Link to="/dashboard/history" hash="numbers" className="flex items-center gap-3 rounded-2xl border border-line bg-card px-3 py-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-violet-600 text-white"><Hash className="size-4" /></span>
          <span><span className="block text-sm font-extrabold">Number history</span><span className="text-xs text-muted">Numbers, codes and active orders</span></span>
        </Link>
        <Link to="/dashboard/history" hash="bills" className="flex items-center gap-3 rounded-2xl border border-line bg-card px-3 py-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-violet-600 text-white"><Receipt className="size-4" /></span>
          <span><span className="block text-sm font-extrabold">Bills history</span><span className="text-xs text-muted">Airtime, data and TV</span></span>
        </Link>
      </section>

      <section className="rounded-[1.4rem] border border-line bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Recent transactions</h2>
          <Link to="/dashboard/history" hash="deposits" className="text-sm font-extrabold text-primary">View all</Link>
        </div>
        <div className="mt-3 space-y-2">
          {txns.slice(0, 4).map((t) => (
            <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-paper px-3 py-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-violet-600 text-white"><Receipt className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold">{t.note}</p>
                <p className="text-xs font-medium text-muted">{when(t.createdAt)}</p>
              </span>
              <span className={`text-sm font-extrabold ${t.amount < 0 ? "text-danger" : "text-ok"}`}>{naira(t.amount)}</span>
            </div>
          ))}
          {!txns.length ? <p className="py-4 text-center text-sm text-muted">No recent transactions yet.</p> : null}
        </div>
      </section>
    </div>
  );
}