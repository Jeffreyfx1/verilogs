import { useMemo, useState, useEffect } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";

import {
  Crown,
  FileText,
  Hash,
  History,
  MessageCircle,
  Play,
  Radio,
  Smartphone,
  Tv,
  Users,
  Zap,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  Globe,
  Music2,
} from "lucide-react";

import { when } from "@/lib/money";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/")({
  component: DashHome,
});

const ukSearch = {
  server: "",
  country: "United Kingdom",
  kind: "",
  service: "WhatsApp",
} as const;

const usSearch = {
  server: "",
  country: "United States",
  kind: "",
  service: "WhatsApp",
} as const;


// ======================================
// QUICK SERVICES
// ======================================

const buySearch = { server: "", country: "", kind: "", service: "" } as const;
const rentSearch = { server: "", country: "", kind: "rent", service: "" } as const;

const quick = [
  {
    to: "/dashboard/airtime",
    label: "Airtime",
    icon: Smartphone,
    popular: true,
  },
  {
    to: "/dashboard/data",
    label: "Data",
    icon: Radio,
    popular: true,
  },
  {
    to: "/dashboard/bills",
    label: "TV Sub",
    icon: Tv,
  },
  {
    to: "/dashboard/bills",
    label: "Electricity",
    icon: Zap,
  },
  {
    to: "/dashboard/numbers",
    label: "Buy Number",
    icon: FileText,
    search: buySearch,
  },
  {
    to: "/dashboard/history",
    label: "Buy Logs",
    icon: Hash,
  },
  {
    to: "/dashboard/numbers",
    label: "Rent Number",
    icon: Crown,
    search: rentSearch,
  },
  {
    to: "/dashboard/announcements",
    label: "Posts",
    icon: MessageCircle,
  },
  {
    to: "/faq",
    label: "Tutorials",
    icon: Play,
  },
  {
    to: "/dashboard/profile",
    label: "Refer",
    icon: Users,
  },
  {
    to: "/community",
    label: "Channel",
    icon: MessageCircle,
  },
] as const;


// ======================================
// PROMOTIONAL SLIDER DATA
// ======================================

const promoSlides = [
  {
    id: "uk",
    title: "Cheap UK Line",
    description: "Fast UK numbers for verification at the best rates.",
    image:
      "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1000&q=90",
    label: "Buy UK Number",
    icon: Globe,
  },
  {
    id: "us",
    title: "Cheap US Line",
    description: "Get affordable US virtual numbers for online verification.",
    image:
      "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1000&q=90",
    label: "Buy US Number",
    icon: Globe,
  },
  {
    id: "tiktok",
    title: "TikTok Account Logs",
    description: "Explore available TikTok account log offers.",
    image:
      "https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=1000&q=90",
    label: "Buy TikTok Logs",
    icon: Music2,
  },
] as const;


// ======================================
// PROMOTIONAL SLIDER
// ======================================

function PromoSlider() {
  const [active, setActive] = useState(0);

  const nextSlide = () => {
    setActive((prev) => (prev + 1) % promoSlides.length);
  };

  const previousSlide = () => {
    setActive(
      (prev) =>
        (prev - 1 + promoSlides.length) % promoSlides.length
    );
  };


  // AUTOMATIC SLIDING

  useEffect(() => {
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % promoSlides.length);
    }, 4000);

    return () => clearInterval(timer);
  }, []);


  const slide = promoSlides[active];

  const SlideIcon = slide.icon;


  return (
    <section className="promo-wrapper">

      <div className="promo-viewport">

        <div
          key={slide.id}
          className="promo-card promo-enter relative flex min-h-[10.5rem] items-center gap-3 overflow-hidden rounded-[1.5rem] p-4"
        >

          {/* BACKGROUND IMAGE */}

          <img
            src={slide.image}
            alt={slide.title}
            className="absolute inset-0 h-full w-full object-cover"
          />


          {/* DARK OVERLAY */}

          <div className="absolute inset-0 bg-gradient-to-r from-[#10051f] via-[#1b0842]/90 to-transparent" />

          <div className="absolute inset-0 bg-gradient-to-t from-[#10051f]/50 to-transparent" />


          {/* ICON */}

          <span className="relative z-10 grid size-14 shrink-0 place-items-center rounded-2xl border border-violet-300/40 bg-violet-700/90 text-white shadow-[0_0_25px_#9333ea]">

            <SlideIcon className="size-8" />

          </span>


          {/* SLIDE CONTENT */}

          <div className="relative z-10 min-w-0 flex-1 pb-5">

            <h2 className="text-xl font-extrabold leading-tight drop-shadow-lg">

              {slide.title}

            </h2>


            <p className="mt-1 text-sm font-semibold leading-relaxed text-white/90">

              {slide.description}

            </p>


            {/* BUY BUTTON */}

            {slide.id === "uk" && (

              <Link
                to="/dashboard/numbers"
                search={ukSearch}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2 text-xs font-extrabold shadow-[0_0_20px_#9333ea]"
              >

                Buy UK Number

                <ArrowRight className="size-4" />

              </Link>

            )}


            {slide.id === "us" && (

              <Link
                to="/dashboard/numbers"
                search={usSearch}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2 text-xs font-extrabold shadow-[0_0_20px_#9333ea]"
              >

                Buy US Number

                <ArrowRight className="size-4" />

              </Link>

            )}


            {slide.id === "tiktok" && (

              <Link
                to="/dashboard/history"
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-600 px-4 py-2 text-xs font-extrabold shadow-[0_0_20px_#9333ea]"
              >

                Buy TikTok Logs

                <ArrowRight className="size-4" />

              </Link>

            )}

          </div>


          {/* SLIDE NAVIGATION */}

          <button
            type="button"
            onClick={previousSlide}
            aria-label="Previous promotion"
            className="promo-arrow promo-prev"
          >
            <ChevronLeft className="size-5" />
          </button>

          <button
            type="button"
            onClick={nextSlide}
            aria-label="Next promotion"
            className="promo-arrow promo-next"
          >
            <ChevronRight className="size-5" />
          </button>


          {/* SLIDE INDICATORS */}

          <div className="promo-dots">

            {promoSlides.map((item, index) => (

              <button
                key={item.id}
                type="button"
                aria-label={`Show ${item.title}`}
                onClick={() => setActive(index)}
                className={`promo-dot ${
                  active === index ? "active" : ""
                }`}
              />

            ))}

          </div>

        </div>

      </div>

    </section>
  );
}


// ======================================
// MAIN DASHBOARD
// ======================================

function DashHome() {
  const user = useUser();

  const allTxns = useStore((s) => s.txns);

  const session = useStore((s) => s.sessionUserId);

  const txns = useMemo(
    () => allTxns.filter((t) => t.userId === session),
    [allTxns, session]
  );

  const latestTxn = txns[0];

  const [open, setOpen] = useState(true);

  if (!user) return null;

  const tiles = open ? quick : quick.slice(0, 8);


  return (

    <div className="min-w-0 space-y-5 pb-4">


      {/* ==================================
          TIER UPGRADE BANNER
      ================================== */}

      <section className="tier-card rise relative overflow-hidden rounded-[1.7rem] p-4">

        <div className="pointer-events-none absolute -left-8 -top-10 size-36 rounded-full bg-fuchsia-500/40 blur-3xl" />

        <div className="pointer-events-none absolute -right-8 bottom-0 size-36 rounded-full bg-violet-500/30 blur-3xl" />

        <div className="relative flex items-center gap-3">

          <div className="relative h-40 w-[37%] shrink-0 overflow-hidden rounded-2xl tier-photo">

            <img
              src="https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=700&q=90"
              alt="Smartphone"
              className="absolute inset-0 h-full w-full object-cover"
            />

            <div className="absolute inset-0 bg-gradient-to-t from-[#10051f]/80 to-transparent" />

            <div className="absolute bottom-3 left-2 flex gap-1.5">
              <span>🇺🇸</span>
              <span>🇬🇧</span>
              <span>🇨🇦</span>
            </div>

          </div>


          <div className="relative z-10 min-w-0 flex-1">

            <div className="flex items-center justify-between gap-1">

              <span className="inline-flex items-center gap-1 rounded-full border border-violet-300/40 bg-[#16052f]/80 px-2 py-1 text-[10px] font-extrabold">

                <Crown className="size-3 text-violet-300" />

                Tier 1 / 3

              </span>


              <Link
                to="/dashboard/wallet"
                className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-[10px] font-extrabold shadow-[0_0_18px_#9333ea]"
              >

                Upgrade →

              </Link>

            </div>


            <h2 className="mt-4 text-xl font-extrabold leading-tight">

              Upgrade to{" "}

              <span className="text-violet-300">
                Tier 2
              </span>

            </h2>


            <p className="mt-1 text-xs font-semibold leading-relaxed text-white/85">

              Get more features, higher limits and better rates.

            </p>


            <Link
              to="/dashboard/wallet"
              className="mt-4 flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 px-3 py-2.5 text-xs font-extrabold shadow-[0_0_22px_#9333ea]"
            >

              <Zap className="size-4 text-violet-200" />

              Upgrade Now

            </Link>

          </div>

        </div>

      </section>


      {/* ==================================
          THREE-PROMOTION SLIDER
      ================================== */}

      <PromoSlider />


      {/* ==================================
          QUICK SERVICES
      ================================== */}

      <section>

        <div className="flex items-center justify-between">

          <h2 className="flex items-center gap-2 text-lg font-extrabold">

            <span className="text-2xl text-violet-400">
              ▦
            </span>

            Quick Services

          </h2>


          <button
            type="button"
            className="flex items-center gap-1 text-sm font-extrabold text-violet-400"
            onClick={() => setOpen((v) => !v)}
          >

            {open ? "See less" : "See all"}

            <ChevronRight className="size-4" />

          </button>

        </div>


        <div className="mt-4 grid grid-cols-4 gap-2.5">

          {tiles.map((q) => (

            <Link
              key={q.label}
              to={q.to}
              search={"search" in q ? q.search : undefined}
              className="service-card relative flex min-h-[6.2rem] flex-col items-center justify-center gap-2 rounded-2xl border border-fuchsia-500/50 bg-[#1b0b32] px-1 py-3 text-center shadow-[0_0_16px_#7c3aed33,inset_0_0_15px_#6d28d933]"
            >

              {"popular" in q && q.popular ? (

                <span className="popular-badge absolute -top-2 right-1 rounded-full px-2 py-0.5 text-[9px] font-extrabold text-white">

                  Popular

                </span>

              ) : null}


              <span className="grid size-11 place-items-center rounded-xl bg-violet-600/30 text-fuchsia-400 shadow-[0_0_15px_#a855f744]">

                <q.icon
                  className="size-7"
                  strokeWidth={2.5}
                />

              </span>


              <span className="text-[11px] font-extrabold leading-tight text-white">

                {q.label}

              </span>

            </Link>

          ))}

        </div>

      </section>


      {/* ==================================
          HISTORY
      ================================== */}

      <section className="history-card rounded-[1.5rem] p-3">

        <div className="flex items-center justify-between">

          <h2 className="flex items-center gap-2 text-lg font-extrabold">

            <History className="size-6 text-fuchsia-400" />

            History

          </h2>


          <Link
            to="/dashboard/history"
            className="flex items-center gap-1 text-sm font-extrabold text-violet-400"
          >

            View All

            <ArrowRight className="size-4" />

          </Link>

        </div>


        <Link
          to="/dashboard/history"
          hash="deposits"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-violet-500/40 bg-[#210d45]/90 px-3 py-3 shadow-[inset_0_0_20px_#7c3aed22]"
        >

          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-[0_0_22px_#9333ea]">

            <History className="size-8" />

          </span>


          <span className="min-w-0 flex-1">

            <span className="block text-sm font-extrabold">

              Transaction History

            </span>


            <span className="mt-1 block truncate text-xs font-medium text-white/70">

              {latestTxn
                ? latestTxn.note
                : "Your recent transactions will appear here."}

            </span>


            {latestTxn && (

              <span className="mt-2 block text-[10px] text-violet-300/70">

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