import { useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";

import {
  ArrowRight,
  ChevronRight,
  Crown,
  Eye,
  EyeOff,
  FileDigit,
  FileText,
  Flag,
  History,
  LayoutGrid,
  MessageCircle,
  MessageSquareMore,
  MonitorPlay,
  Plus,
  Send,
  ShieldCheck,
  Signal,
  Smartphone,
  SquarePlay,
  UserRound,
  Users,
  Zap,
} from "lucide-react";

import { TIER_IMAGE, UK_IMAGE } from "@/lib/dashboard-images";
import { naira, when } from "@/lib/money";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/")({
  component: DashHome,
});


/* ======================================
   PROMO SLIDES (add or remove freely)
====================================== */

const ukSearch = { server: "", country: "United Kingdom", kind: "", service: "WhatsApp" } as const;
const usSearch = { server: "", country: "United States", kind: "", service: "WhatsApp" } as const;
const waSearch = { server: "", country: "", kind: "", service: "WhatsApp" } as const;
const tgSearch = { server: "", country: "", kind: "", service: "Telegram" } as const;
const rentSearch = { server: "", country: "", kind: "rent", service: "" } as const;
const buySearch = { server: "", country: "", kind: "", service: "" } as const;

const slides = [
  {
    id: "uk",
    tone: "violet",
    title: "Cheap UK Line",
    text: "Fast UK numbers for verification at the best rates.",
    icon: Zap,
    image: UK_IMAGE,
    search: ukSearch,
  },
  {
    id: "us",
    tone: "blue",
    title: "Cheap USA Line",
    text: "Reliable US numbers for every app you verify.",
    icon: Flag,
    image: null,
    search: usSearch,
  },
  {
    id: "wa",
    tone: "green",
    title: "WhatsApp Numbers",
    text: "Instant OTP for WhatsApp, from any country.",
    icon: MessageCircle,
    image: null,
    search: waSearch,
  },
  {
    id: "tg",
    tone: "sky",
    title: "Telegram Numbers",
    text: "Verify Telegram accounts in seconds.",
    icon: Send,
    image: null,
    search: tgSearch,
  },
  {
    id: "rent",
    tone: "fuchsia",
    title: "Rent a Number",
    text: "Keep a number longer for repeat logins.",
    icon: Crown,
    image: null,
    search: rentSearch,
  },
] as const;

/* ======================================
   QUICK SERVICES
====================================== */

const quick = [
  { to: "/dashboard/airtime", label: "Airtime", icon: Smartphone, popular: true },
  { to: "/dashboard/data", label: "Data", icon: Signal, popular: true },
  { to: "/dashboard/bills", label: "TV Sub", icon: MonitorPlay },
  { to: "/dashboard/bills", label: "Electricity", icon: Zap },
  { to: "/dashboard/numbers", label: "Buy Number", icon: FileDigit, search: buySearch },
  { to: "/dashboard/extra", label: "Buy Logs", icon: FileText },
  { to: "/dashboard/numbers", label: "Rent Number", icon: Crown, search: rentSearch },
  { to: "/dashboard/announcements", label: "Posts", icon: MessageSquareMore },
  { to: "/faq", label: "Tutorials", icon: SquarePlay },
  { to: "/dashboard/profile", label: "Refer", icon: Users },
  { to: "/community", label: "Channel", icon: Send },
] as const;

/* ======================================
   PROMO CAROUSEL
====================================== */

function PromoCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const paused = useRef(false);
  const [active, setActive] = useState(0);

  const step = () => {
    const el = trackRef.current;
    const first = el?.children[0] as HTMLElement | undefined;
    return first ? first.offsetWidth + 12 : 1;
  };

  const goTo = (i: number) => {
    trackRef.current?.scrollTo({ left: i * step(), behavior: "smooth" });
  };

  // auto-slide
  useEffect(() => {
    const id = window.setInterval(() => {
      if (paused.current) return;
      goTo((indexRef.current + 1) % slides.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);

  const onScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.min(slides.length - 1, Math.max(0, Math.round(el.scrollLeft / step())));
    indexRef.current = i;
    setActive(i);
  };

  return (
    <div>
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={() => (paused.current = true)}
        onPointerUp={() => window.setTimeout(() => (paused.current = false), 3000)}
        onPointerCancel={() => (paused.current = false)}
        className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto"
      >
        {slides.map((s) => (
          <Link
            key={s.id}
            to="/dashboard/numbers"
            search={s.search}
            className={`promo-slide slide-${s.tone} relative flex min-h-[8.75rem] w-full shrink-0 snap-start items-center gap-3 overflow-hidden rounded-[1.4rem] p-4`}
          >
            {s.image ? (
              <img
                src={s.image}
                alt=""
                className="absolute inset-y-0 right-0 h-full w-[75%] object-cover object-right"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span className="promo-orb pointer-events-none absolute -right-6 -top-8 size-36 rounded-full" />
            )}

            <span className="promo-fade pointer-events-none absolute inset-0" />

            <span className="promo-icon relative z-10 grid size-14 shrink-0 place-items-center rounded-2xl text-white">
              <s.icon className="size-8" strokeWidth={2.2} />
            </span>

            <span className="relative z-10 min-w-0 flex-1 ">
              <span className="block text-lg font-extrabold text-white">{s.title}</span>
              <span className="mt-1 block max-w-[14rem] text-[13px] font-medium leading-snug text-white/85">
                {s.text}
              </span>
            </span>
          </Link>
        ))}
      </div>

      {/* DOTS */}
      <div className="mt-2.5 flex items-center justify-center gap-1.5">
        {slides.map((s, i) => (
          <button
            key={s.id}
            type="button"
            aria-label={`Go to slide ${i + 1}`}
            onClick={() => goTo(i)}
            className={`h-1.5 rounded-full transition-all ${
              i === active ? "w-5 bg-fuchsia-400" : "w-1.5 bg-violet-400/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* ======================================
   MAIN DASHBOARD
====================================== */

function DashHome() {
  const user = useUser();
  const allTxns = useStore((s) => s.txns);
  const session = useStore((s) => s.sessionUserId);

  const txns = useMemo(
    () => allTxns.filter((t) => t.userId === session),
    [allTxns, session],
  );

  const latestTxn = txns[0];
  const [open, setOpen] = useState(true);
  const [showBal, setShowBal] = useState(true);
  const orders = useStore((s) => s.orders);

  if (!user) return null;

  const tiles = open ? quick : quick.slice(0, 8);
  const code = `VER-${user.id.slice(-4).toUpperCase()}`;
  const totalOtp = orders.filter((order) => order.userId === user.id && (order.category === "numbers" || order.category === "rent") && (order.status === "completed" || order.status === "received")).length;

  return (
    <div className="min-w-0 space-y-4 pb-4">
      <header className="px-0.5">
        <h1 className="text-[1.7rem] font-extrabold leading-tight text-white">Welcome back</h1>
        <p className="mt-1 text-[13px] font-medium leading-snug text-white/70">Wallet, bills, numbers and verification services in one place.</p>
        <span className="account-pill mt-3 inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-bold text-white">
          <ShieldCheck className="size-4 text-violet-300" />
          Tier 1 Account
        </span>
      </header>

      <section className="balance-card rise relative overflow-hidden rounded-[1.7rem] p-4">
        <span className="balance-orb pointer-events-none absolute -right-16 -top-12 size-60 rounded-full" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold tracking-[0.18em] text-white/80">AVAILABLE BALANCE</p>
            <span className="balance-glass mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold text-white">
              <UserRound className="size-4" />
              {code}
            </span>
          </div>
          <Link to="/dashboard/wallet" className="balance-glass inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold whitespace-nowrap text-white">
            <Plus className="size-4" />
            Fund Wallet
          </Link>
        </div>
        <div className="relative mt-4 flex items-center gap-3">
          <p className="text-[2.4rem] font-extrabold leading-none text-white">{showBal ? naira(user.balance) : "₦••••••"}</p>
          <button type="button" aria-label={showBal ? "Hide balance" : "Show balance"} onClick={() => setShowBal((v) => !v)} className="balance-glass grid size-11 place-items-center rounded-full text-white">
            {showBal ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
          </button>
        </div>
        <div className="relative mt-4 grid grid-cols-2 gap-3">
          <div className="balance-glass rounded-2xl p-3">
            <p className="text-[11px] font-bold tracking-wider text-white/80">TOTAL OTP</p>
            <p className="mt-2 text-lg font-extrabold text-white">{totalOtp}</p>
            <p className="mt-0.5 text-xs font-medium text-white/60">Verified</p>
          </div>
          <div className="balance-glass rounded-2xl p-3">
            <p className="text-[11px] font-bold tracking-wider text-white/80">KYC LEVEL</p>
            <p className="mt-2 text-lg font-extrabold text-white">Tier 1</p>
            <p className="mt-0.5 text-xs font-medium text-white/60">In Progress</p>
          </div>
        </div>
      </section>

      {/* ================= TIER BANNER ================= */}
      <section className="tier-card rise relative min-h-[9.75rem] overflow-hidden rounded-[1.6rem]">
        <img
          src={TIER_IMAGE}
          alt="Person holding a smartphone"
          className="absolute inset-y-0 left-0 h-full w-[55%] object-cover object-center"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <div className="tier-fade pointer-events-none absolute inset-0" />

        <div className="relative z-10 ml-auto flex min-h-[9.75rem] w-[57%] flex-col justify-center p-3 pl-1">
          <div className="flex items-center justify-between gap-1">
            <span className="tier-badge inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-bold whitespace-nowrap text-white">
              <Crown className="size-3.5 fill-yellow-400 text-yellow-400" />
              Tier 1 / 3
            </span>

            <Link
              to="/dashboard/wallet"
              className="upgrade-pill inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap text-white"
            >
              Upgrade
              <ArrowRight className="size-3" />
            </Link>
          </div>

          <h2 className="mt-2.5 text-[1.2rem] font-extrabold leading-tight text-white">
            Upgrade to <span className="text-yellow-400">Tier 2</span>
          </h2>

          <p className="mt-1 text-[11.5px] font-medium leading-snug text-white/85">
            Get more features, higher limits and better rates.
          </p>

          <Link
            to="/dashboard/wallet"
            className="upgrade-btn mt-2.5 flex items-center justify-center gap-2 rounded-full px-3 py-2 text-[13px] font-bold text-white"
          >
            <Zap className="size-4 fill-yellow-400 text-yellow-400" />
            Upgrade Now
          </Link>
        </div>
      </section>

      {/* ================= PROMO SLIDES ================= */}
      <PromoCarousel />

      {/* ================= QUICK SERVICES ================= */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
            <LayoutGrid className="size-6 fill-violet-400/60 text-violet-400" />
            Quick Services
          </h2>

          <button
            type="button"
            className="flex items-center gap-0.5 text-sm font-bold text-fuchsia-400"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "See less" : "See all"}
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2.5">
          {tiles.map((q) => (
            <Link
              key={q.label}
              to={q.to}
              search={"search" in q ? q.search : undefined}
              className="service-card relative flex min-h-[5.6rem] flex-col items-center justify-center gap-2 rounded-2xl px-1 py-3 text-center"
            >
              {"popular" in q && q.popular ? (
                <span className="popular-badge absolute -top-2 right-1.5 rounded-full px-2 py-0.5 text-[9px] font-extrabold">
                  Popular
                </span>
              ) : null}

              <q.icon className="size-8 fill-violet-400/40 text-violet-300" strokeWidth={2} />

              <span className="text-[11px] font-bold leading-tight text-white">{q.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ================= HISTORY ================= */}
      <section className="history-card rounded-[1.4rem] p-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
            <History className="size-6 text-violet-300" />
            History
          </h2>

          <Link
            to="/dashboard/history"
            className="flex items-center gap-1 text-sm font-bold text-fuchsia-400"
          >
            View All
            <ArrowRight className="size-4" />
          </Link>
        </div>

        <Link
          to="/dashboard/history"
          hash="deposits"
          className="mt-2 flex items-center gap-3 rounded-2xl bg-[#241048]/80 px-3 py-2.5"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-700 text-white shadow-[0_0_18px_#9333ea88]">
            <History className="size-7" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-white">Transaction History</span>
            <span className="mt-0.5 block truncate text-xs font-medium text-white/70">
              {latestTxn ? latestTxn.note : "Your recent transactions will appear here."}
            </span>
            {latestTxn && (
              <span className="mt-1 block text-[10px] text-violet-300/70">
                {when(latestTxn.createdAt)}
              </span>
            )}
          </span>

          <ChevronRight className="size-6 shrink-0 text-fuchsia-400" />
        </Link>
      </section>
    </div>
  );
}
