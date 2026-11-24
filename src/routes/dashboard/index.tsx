import { useEffect, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { Glyph, glyph } from "@/components/icons";
import { isMajorService, ServiceLink } from "@/components/service-nav";

import { UK_IMAGE } from "@/lib/dashboard-images";
import { useUser, useStore } from "@/lib/store";
import { naira, when } from "@/lib/money";
import { listPurchases, type HistoryOrder } from "@/lib/purchase-history";
import { publicSiteImages } from "@/lib/shop-fns";

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
const buySearch = { server: "", country: "", kind: "", service: "" } as const;

const slides = [
  {
    id: "uk",
    tone: "blue",
    title: "Cheap UK Line",
    text: "Fast UK numbers for verification at the best rates.",
    icon: glyph.bolt,
    image: UK_IMAGE,
    to: "/dashboard/numbers",
    search: ukSearch,
  },
  {
    id: "us",
    tone: "sky",
    title: "Cheap USA Line",
    text: "Reliable US numbers for every app you verify.",
    icon: glyph.flag,
    image: null,
    to: "/dashboard/numbers",
    search: usSearch,
  },
  {
    id: "wa",
    tone: "green",
    title: "WhatsApp Numbers",
    text: "Instant OTP for WhatsApp, from any country.",
    icon: glyph.chat,
    image: "/photos/banner-wa.webp",
    to: "/dashboard/numbers",
    search: waSearch,
  },
  {
    id: "tg",
    tone: "sky",
    title: "Telegram Numbers",
    text: "Verify Telegram accounts in seconds.",
    icon: glyph.send,
    image: null,
    to: "/dashboard/numbers",
    search: tgSearch,
  },
] as const;

/* ======================================
   QUICK SERVICES
====================================== */

const quick = [
  { to: "/dashboard/airtime", label: "Airtime", icon: glyph.phone },
  { to: "/dashboard/data", label: "Data", icon: glyph.data },
  { to: "/dashboard/numbers", label: "Buy Number", icon: glyph.hash, search: buySearch },
  { to: "/dashboard/numbers", label: "USA", icon: glyph.flag, search: { server: "", country: "", kind: "usa", service: "" } },
  { to: "/dashboard/extra", label: "SMM", icon: glyph.file, hash: "smm" },
  { to: "/dashboard/extra", label: "Logs / VPN", icon: glyph.grid, hash: "random" },
  { to: "/dashboard/telegram", label: "Telegram Premium", icon: glyph.send },
  { to: "/dashboard/rent", label: "Rent numbers", icon: glyph.crown },
  { to: "/dashboard/announcements", label: "Posts", icon: glyph.posts },
  { to: "/faq", label: "Tutorials", icon: glyph.play },
  { to: "/community", label: "Channel", icon: glyph.send },
  { to: "/dashboard/refer", label: "Refer & Earn", icon: glyph.users },
] as const;

/* ======================================
   PROMO CAROUSEL
====================================== */

function PromoCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(0);
  const paused = useRef(false);
  const [active, setActive] = useState(0);
  const [waSrc, setWaSrc] = useState("/photos/banner-wa.webp");

  useEffect(() => {
    let live = true;
    void publicSiteImages()
      .then((rows) => {
        if (!live) return;
        const row = rows.find((item) => item.id === "banner-wa");
        const mobile = window.matchMedia("(max-width: 767px)").matches;
        const stamp = mobile ? row?.mobile || row?.desktop : row?.desktop;
        if (!stamp) return;
        const variant = mobile && row?.mobile ? "mobile" : "desktop";
        setWaSrc(`/api/site-image/banner-wa?variant=${variant}&v=${encodeURIComponent(stamp)}`);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

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
      <div className="min-w-0 max-w-full overflow-hidden">
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={() => (paused.current = true)}
        onPointerUp={() => window.setTimeout(() => (paused.current = false), 3000)}
        onPointerCancel={() => (paused.current = false)}
        className="no-scrollbar flex w-full min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto"
      >
        {slides.map((s) => {
          const photo = s.id === "wa" ? waSrc : s.image;
          return (
          <ServiceLink
            key={s.id}
            to={s.to}
            search={s.search}
            className={`promo-slide slide-${s.tone} relative flex min-h-[7.15rem] w-full min-w-full max-w-full shrink-0 basis-full snap-start items-center gap-3 overflow-hidden rounded-[1.15rem] p-3.5 md:min-w-0 md:max-w-none md:basis-auto md:w-[calc(50%-0.375rem)] xl:w-[calc(33.333%-0.5rem)]`}
          >
            {photo ? (
              <img
                src={photo}
                alt=""
                className={`promo-photo pointer-events-none absolute inset-y-0 right-0 h-full w-[78%] object-cover object-center ${s.id === "wa" ? "promo-photo-fade" : ""}`}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <span className="promo-orb pointer-events-none absolute -right-6 -top-8 size-36 rounded-full" />
            )}

            <span className="promo-fade pointer-events-none absolute inset-0" />

            <span className={`promo-icon relative z-10 grid size-11 shrink-0 place-items-center rounded-2xl text-white ${s.id === "wa" ? "promo-icon-wa" : ""}`}>
              <Glyph icon={s.icon} className="size-5" />
            </span>

            <span className="relative z-10 min-w-0 flex-1">
              <span className="block text-base font-extrabold leading-tight text-white">{s.title}</span>
              <span className="mt-1 block max-w-[14rem] text-xs font-medium leading-snug text-white/85">
                {s.text}
              </span>
            </span>
          </ServiceLink>
          );
        })}
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
              i === active ? "w-5 bg-[#1d4ed8]" : "w-1.5 bg-[#1d4ed8]/30"
            }`}
          />
        ))}
      </div>
      </div>
    </div>
  );
}

/* ======================================
   MAIN DASHBOARD
====================================== */

function DashHome() {
  const user = useUser();
  const orders = useStore((s) => s.orders);
  const [hide, setHide] = useState(false);
  if (!user) return null;
  const account = listPurchases(orders, { userId: user.id, filter: "all" });
  const mine = account.filter((order) => order.status !== "refunded");
  const sms = mine.filter((order) => order.category === "numbers" || order.category === "rent" || order.category === "usa" || order.category === "number").length;
  const spent = mine.reduce((sum, order) => sum + order.amount, 0);
  const recent = (pred: (order: HistoryOrder) => boolean) => account.filter(pred).slice(0, 4);

  return (
    <div className="dash-home min-w-0 space-y-3 pb-2">
      <div>
        <h1 className="text-xl font-extrabold text-ink">Welcome back{user.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
        <p className="mt-0.5 text-xs text-muted">Wallet, numbers, data and digital services in one place.</p>
      </div>

      <section className="balance-card overflow-hidden rounded-[1.25rem] px-4 py-3.5 text-white">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-bold tracking-[0.14em] text-white/80">AVAILABLE BALANCE</p>
          <Link to="/dashboard/wallet" className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-extrabold">+ Fund wallet</Link>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <p className="text-[1.85rem] font-extrabold leading-none tracking-tight">{hide ? "₦••••" : naira(user.balance)}</p>
          <button type="button" aria-label={hide ? "Show balance" : "Hide balance"} className="grid size-8 place-items-center rounded-full bg-white/15" onClick={() => setHide((v) => !v)}>
            {hide ? <Glyph icon={glyph.eyeOff} className="size-4" /> : <Glyph icon={glyph.eye} className="size-4" />}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="balance-glass rounded-xl px-3 py-1.5">
            <p className="text-[10px] font-bold tracking-wide text-white/70">NUMBERS</p>
            <p className="text-base font-extrabold">{sms}</p>
            <p className="text-[11px] text-white/70">Bought</p>
          </div>
          <div className="balance-glass rounded-xl px-3 py-1.5">
            <p className="text-[10px] font-bold tracking-wide text-white/70">SPENT</p>
            <p className="text-base font-extrabold">{hide ? "••••" : naira(spent)}</p>
            <p className="text-[11px] text-white/70">On this account</p>
          </div>
        </div>
        <div className="mt-2 text-right">
          <Link to="/dashboard/history" className="text-xs font-extrabold underline">View history</Link>
        </div>
      </section>

      <PromoCarousel />

      <section className="dash-panel">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-base font-extrabold text-ink">Quick services</h2>
        </div>
        <div className="quick-grid">
          {quick.map((q) => {
            const body = (
              <>
                <span className="svc-icon">
                  <Glyph icon={q.icon} className="size-4" />
                </span>
                <span className="text-[11px] font-bold leading-tight text-ink">{q.label}</span>
              </>
            );
            const cls = "quick-tile relative flex flex-col items-center justify-center gap-1.5 px-1 py-2 text-center";
            const soon = q.label === "Airtime" || q.label === "SMM" || q.label === "Telegram Premium";
            const search = "search" in q ? q.search : undefined;
            const hash = "hash" in q ? q.hash : undefined;
            const inner = (
              <>
                {soon ? <span className="absolute right-1 top-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-extrabold text-white">Soon</span> : null}
                {body}
              </>
            );
            if (isMajorService(q.to, q.label)) {
              return (
                <ServiceLink key={q.label} to={q.to} search={search} hash={hash} className={cls}>
                  {inner}
                </ServiceLink>
              );
            }
            return (
              <Link key={q.label} to={q.to} search={search} hash={hash} className={cls}>
                {inner}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="dash-panel">
        <h2 className="px-1 text-base font-extrabold text-ink">History</h2>
        <div className="mt-2">
          <Link to="/dashboard/history" className="flex items-center gap-3 rounded-xl bg-[#E7EEF8] px-3 py-2.5">
            <span className="svc-icon size-10">
              <Glyph icon={glyph.history} className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-extrabold text-ink">Order history</span>
              <span className="block text-xs text-muted">Logs, VPN, numbers and other purchases</span>
            </span>
          </Link>
        </div>
      </section>

      <HistoryPreview title="Number history" hash="bought" empty="No number purchases yet." rows={recent((order) => order.category === "numbers" || order.category === "number" || order.category === "usa")} />
      <HistoryPreview title="Data history" hash="data" empty="No data purchases yet." rows={recent((order) => order.category === "data")} />
      <HistoryPreview title="Rent number history" hash="rent" empty="No rented numbers yet." rows={recent((order) => order.category === "rent")} />
      <InstallApp />
    </div>
  );
}

function HistoryPreview({ title, hash, empty, rows }: { title: string; hash: string; empty: string; rows: HistoryOrder[] }) {
  return (
    <section className="dash-panel">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-base font-extrabold text-ink">{title}</h2>
        <Link to="/dashboard/history" hash={hash} className="text-xs font-extrabold text-[#1d4ed8]">View all</Link>
      </div>
      <div className="mt-2">
        {rows.length ? rows.map((order) => (
          <article key={order.id} className="dash-row">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-extrabold text-ink">{order.title}</p>
              <p className="shrink-0 text-sm font-extrabold">{naira(order.amount)}</p>
            </div>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-[11px] text-muted">{when(order.createdAt)} · {order.status}</p>
              <Link to="/purchase-result/$orderId" params={{ orderId: order.id }} className="shrink-0 rounded-full bg-[#12357a] px-2.5 py-1 text-[11px] font-extrabold text-white">Details</Link>
            </div>
          </article>
        )) : <p className="rounded-xl bg-[#f4f7fb] px-3 py-3 text-xs text-muted">{empty}</p>}
      </div>
    </section>
  );
}

function InstallApp() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);
  const [standalone, setStandalone] = useState(false);
  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    const installed = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    setStandalone(installed);
    if (installed) return;
    const ua = navigator.userAgent;
    setIos(/iPhone|iPad/i.test(ua) && !/CriOS|FxiOS/i.test(ua));
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  if (standalone) return null;
  return (
    <section className="rounded-[1.4rem] bg-white p-4 shadow-[0_8px_24px_rgba(8,50,74,0.05)]">
      <h2 className="text-base font-extrabold text-[#12313c]">Install app</h2>
      <p className="mt-1 text-sm text-[#5c7380]">Add VeriLogs to your home screen. It opens full screen and keeps you signed in.</p>
      {prompt ? (
        <button type="button" className="btn-accent mt-3 w-full rounded-xl py-2.5 text-sm font-bold text-white" onClick={() => void prompt.prompt()}>
          Install app
        </button>
      ) : (
        <button type="button" className="mt-3 w-full rounded-xl bg-[#e7f5fb] py-2.5 text-sm font-bold text-[#0c6e8a]" onClick={() => setHelp(true)}>
          {ios ? "Add to Home Screen" : "How to install"}
        </button>
      )}
      {help ? (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[#12313c]">
          <li>Open veri-logs.com in Safari on iPhone.</li>
          <li>Tap the Share button.</li>
          <li>Choose Add to Home Screen.</li>
          <li>Confirm. Android Chrome shows Install app when the browser allows it.</li>
        </ol>
      ) : null}
    </section>
  );
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };
