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
    <div className="relative h-36 w-28 shrink-0">
      <span className="orbit-ring absolute inset-2 rounded-[2rem] border-2 border-cyan-300/70 shadow-[0_0_18px_#22d3ee]" />
      <div className="float-slow absolute left-3 top-1 h-32 w-[4.5rem] rounded-[1.4rem] border-2 border-violet-200/40 bg-gradient-to-b from-[#2a1468] to-[#12081f] shadow-[0_12px_24px_rgba(0,0,0,.45)]">
        <span className="absolute left-1/2 top-1 h-1 w-6 -translate-x-1/2 rounded-full bg-white/30" />
        <span className="absolute left-2 top-8 grid size-10 place-items-center rounded-2xl bg-violet-500 shadow-[0_0_16px_#8b5cf6]">
          <span className="flex gap-0.5">
            <span className="size-1.5 rounded-full bg-white" />
            <span className="size-1.5 rounded-full bg-white" />
            <span className="size-1.5 rounded-full bg-white" />
          </span>
        </span>
      </div>
      <span className="absolute -right-1 top-2 text-xl">🇺🇸</span>
      <span className="absolute -right-2 top-12 text-xl">🇬🇧</span>
      <span className="absolute right-0 bottom-2 text-xl">🇨🇦</span>
    </div>
  );
}

function BigBen() {
  return (
    <svg viewBox="0 0 80 70" className="h-16 w-20 text-violet-300/70" aria-hidden="true">
      <path fill="currentColor" d="M38 4h8v6h6v8H32V10h6V4zm-8 16h24v34H30V20zm8 6h8v8h-8v-8zm-14 30h36v6H24v-6zM18 62h48v4H18z" />
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
      <section className="tier-card rise relative overflow-hidden rounded-[1.6rem] p-4">
        <div className="flex items-center gap-2">
          <PhoneArt />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-black/30 px-2 py-1 text-[11px] font-extrabold">
                <Crown className="size-3 text-amber-300" /> Tier 1 / 3
              </span>
              <Link to="/dashboard/wallet" className="rounded-full bg-violet-600 px-3 py-1 text-[11px] font-extrabold">Upgrade →</Link>
            </div>
            <h2 className="mt-3 text-xl font-extrabold leading-tight">Upgrade to <span className="text-amber-300">Tier 2</span></h2>
            <p className="mt-1 text-sm font-medium text-white/75">Get more features, higher limits and better rates.</p>
            <Link to="/dashboard/wallet" className="mt-3 inline-flex items-center gap-2 rounded-full bg-violet-600 px-4 py-2 text-sm font-extrabold shadow-[0_8px_20px_rgba(109,40,217,.45)]">
              <Zap className="size-4" /> Upgrade Now
            </Link>
          </div>
        </div>
      </section>

      <Link to="/dashboard/numbers" search={ukSearch} className="uk-card relative flex items-center gap-3 overflow-hidden rounded-[1.4rem] p-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-violet-600 text-white shadow-[0_0_16px_#7c3aed]">
          <Zap className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold">Cheap UK Line</span>
          <span className="mt-0.5 block text-sm font-medium text-white/70">Fast UK numbers for verification at the best rates.</span>
          <span className="mt-2 inline-flex rounded-full bg-violet-600 px-3 py-1 text-xs font-extrabold">Buy Now</span>
        </span>
        <span className="pointer-events-none absolute bottom-0 right-2 opacity-80"><BigBen /></span>
      </Link>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold"><span className="text-primary">▦</span> Quick Services</h2>
          <button type="button" className="text-sm font-extrabold text-primary" onClick={() => setOpen((v) => !v)}>{open ? "See less" : "See all"} →</button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2.5">
          {tiles.map((q) => (
            <Link key={q.label} to={q.to} search={"search" in q ? q.search : undefined} className="relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-violet-800/80 bg-[#1a1033] px-1 py-3 text-center shadow-[0_8px_18px_rgba(76,29,149,.25)]">
              {"popular" in q && q.popular ? <span className="absolute -top-2 rounded-full bg-amber-300 px-1.5 py-0.5 text-[9px] font-extrabold text-black">Popular</span> : null}
              <span className="grid size-11 place-items-center rounded-full bg-violet-600/30 text-violet-200">
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