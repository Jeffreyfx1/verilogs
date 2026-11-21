import { useLayoutEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { Glyph, glyph, type GlyphIcon } from "@/components/icons";
import { PublicFrame } from "@/components/chrome";
import { Reveal } from "@/components/reveal";
import { publicSiteImages } from "@/lib/shop-fns";
import { SITE_SLOTS, photoSlotFor, staticPhoto, type SiteSlot } from "@/lib/site-images";
import { useStore } from "@/lib/store";

type PhotoRow = { alt: string; desktop: string; mobile: string };
type PhotoMap = Record<string, PhotoRow>;

function photoMap(rows: { id: string; alt: string; desktop: string; mobile: string }[]): PhotoMap {
  const photos: PhotoMap = {};
  for (const row of rows) photos[row.id] = { alt: row.alt, desktop: row.desktop, mobile: row.mobile };
  return photos;
}

function photoSrc(slot: SiteSlot, variant: "desktop" | "mobile", photos: PhotoMap) {
  const row = photos[slot];
  const stamp = variant === "mobile" ? row?.mobile || row?.desktop : row?.desktop;
  if (!stamp) return staticPhoto(slot, variant);
  return `/api/site-image/${slot}?variant=${variant}&v=${encodeURIComponent(stamp)}`;
}

function heroPreload(photos: PhotoMap) {
  const desktop = photoSrc("hero", "desktop", photos);
  const mobile = photoSrc("hero", "mobile", photos);
  const links = [
    { rel: "preload" as const, as: "image" as const, href: desktop, type: "image/webp", media: "(min-width: 768px)", fetchPriority: "high" as const },
  ];
  if (mobile !== desktop) links.push({ rel: "preload", as: "image", href: mobile, type: "image/webp", media: "(max-width: 767px)", fetchPriority: "high" });
  return links;
}

export const Route = createFileRoute("/")({
  loader: () => publicSiteImages().then(photoMap).catch(() => ({}) as PhotoMap),
  head: ({ loaderData }) => ({ links: heroPreload(loaderData || {}) }),
  component: Home,
});

const why: { icon: GlyphIcon; title: string; body: string }[] = [
  { icon: glyph.shield, title: "Wallet stays in naira", body: "Fund once. Spend on numbers, data and digital services." },
  { icon: glyph.bolt, title: "Instant delivery", body: "A number shows on the order. The SMS code lands on that same card." },
  { icon: glyph.lock, title: "Servers stay apart", body: "Choose Server 1, Server 2 or Server 3. Each one keeps its own prices and stock." },
  { icon: glyph.headset, title: "Support on the page", body: "FAQ, tickets and the Telegram channel sit with the shop." },
  { icon: glyph.check, title: "Pay from your wallet", body: "Fund once in naira, then buy a number, data or another digital service." },
  { icon: glyph.globe, title: "Services in one place", body: "Numbers, data, logs and social services from your dashboard." },
];

function SlotImage({ slot, alt, className, priority, photos, sizes }: { slot: SiteSlot; alt: string; className?: string; priority?: boolean; photos: PhotoMap; sizes: string }) {
  return (
    <picture>
      <source media="(max-width: 767px)" srcSet={photoSrc(slot, "mobile", photos)} type="image/webp" />
      <img
        src={photoSrc(slot, "desktop", photos)}
        alt={alt}
        width={1400}
        height={933}
        sizes={sizes}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "low"}
        className={`bg-paper ${className || ""}`}
      />
    </picture>
  );
}

function HowItWorks() {
  const root = useRef<HTMLDivElement>(null);
  const [d, setD] = useState("");
  const steps: { icon: GlyphIcon; title: string; body: string }[] = [
    { icon: glyph.users, title: "Create account", body: "Sign up with email or Google. A Google account still confirms a name and phone." },
    { icon: glyph.wallet, title: "Fund wallet", body: "Add naira. That balance is what you spend." },
    { icon: glyph.package, title: "Buy", body: "Pick a server or a network. The number, code or recharge shows on the order." },
  ];

  useLayoutEffect(() => {
    const box = root.current;
    if (!box) return;
    const draw = () => {
      const origin = box.getBoundingClientRect();
      const orbs = [...box.querySelectorAll<HTMLElement>("[data-how-orb]")];
      const pts = orbs.map((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2 - origin.left, y: rect.top + rect.height / 2 - origin.top };
      });
      if (pts.length < 2) return;
      let path = `M ${pts[0].x} ${pts[0].y}`;
      for (let i = 0; i < pts.length - 1; i += 1) {
        const a = pts[i];
        const b = pts[i + 1];
        const drop = (b.y - a.y) * 0.55;
        path += ` C ${a.x} ${a.y + drop}, ${b.x} ${b.y - drop}, ${b.x} ${b.y}`;
      }
      setD(path);
    };
    draw();
    const watch = new ResizeObserver(draw);
    watch.observe(box);
    window.addEventListener("resize", draw);
    return () => {
      watch.disconnect();
      window.removeEventListener("resize", draw);
    };
  }, []);

  return (
    <section id="how" className="overflow-hidden bg-paper py-16">
      <div className="mx-auto max-w-3xl px-4">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold">How it works</h2>
          <p className="mt-2 text-center text-sm font-medium text-muted">Three steps, then the shop is yours.</p>
        </Reveal>
        <div ref={root} className="relative mx-auto mt-14">
          <svg className="how-snake pointer-events-none absolute inset-0 z-0 h-full w-full" aria-hidden="true">
            {d ? <path d={d} fill="none" stroke="currentColor" strokeWidth="2.25" strokeDasharray="8 10" strokeLinecap="round" /> : null}
          </svg>
          <ol className="relative z-10 space-y-16 sm:space-y-24">
            {steps.map((step, index) => {
              const left = index % 2 === 0;
              return (
                <li key={step.title} className={`flex items-center gap-4 sm:gap-10 ${left ? "" : "flex-row-reverse"}`}>
                  <div data-how-orb className="how-orb grid size-24 shrink-0 place-items-center rounded-full sm:size-40">
                    <Glyph icon={step.icon} className="size-12 sm:size-20" />
                  </div>
                  <div className={`min-w-0 flex-1 ${left ? "text-left" : "text-center sm:text-right"}`}>
                    <h3 className="text-2xl font-extrabold text-ink sm:text-4xl">{step.title}</h3>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-muted sm:text-base">{step.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Home() {
  const home = useStore((s) => s.settings.home);
  const photos = Route.useLoaderData();
  const cards = (home.cards || []).filter((card) => !/\bbills?\b|cable|electricity|exam pin|gift card|betting/i.test(`${card.title} ${card.body}`));
  const altFor = (slot: SiteSlot) => photos[slot]?.alt || SITE_SLOTS.find((item) => item.id === slot)?.alt || "";
  return (
    <PublicFrame>
      <section className="hero-wash relative overflow-hidden">
        <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 lg:grid-cols-2">
          <div className="text-left">
            <p className="rise inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-bold text-primary">
              <Glyph icon={glyph.check} className="size-3.5" /> {home.eyebrow}
            </p>
            <h1 className="hero-title rise mt-5 max-w-xl text-4xl font-extrabold text-ink sm:text-5xl">{home.title}</h1>
            <p className="rise mt-4 max-w-xl text-base font-medium leading-relaxed text-muted">{home.body}</p>
            <div className="rise mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link to="/register" className="btn-gradient rounded-2xl px-6 py-3.5 text-center text-sm font-extrabold">Create free account</Link>
              <a href="#offer" className="rounded-2xl border border-line bg-card px-6 py-3.5 text-center text-sm font-extrabold text-ink shadow-card">Explore services</a>
            </div>
            <ul className="rise mt-6 flex flex-wrap gap-2 text-xs font-bold text-ink">
              {["Instant delivery", "Naira wallet", "Servers kept apart"].map((item) => (
                <li key={item} className="rounded-full bg-card px-3 py-1.5 shadow-card">{item}</li>
              ))}
            </ul>
          </div>
          <SlotImage slot="hero" alt={altFor("hero")} priority photos={photos} sizes="(min-width: 1024px) 560px, 100vw" className="aspect-[3/2] w-full rounded-card object-cover shadow-card" />
        </div>
      </section>

      {cards.length ? (
      <section className="overflow-hidden py-6">
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
          {cards.map((o, i) => {
            const slot = photoSlotFor(o.title);
            return (
            <Reveal key={o.id} className="w-[85%] max-w-sm shrink-0 snap-start" delay={i * 90}>
              <Link to="/register" className="flex items-center gap-3 rounded-card border border-line bg-card p-3 shadow-card">
                <SlotImage slot={slot} alt={altFor(slot)} photos={photos} sizes="64px" className="size-16 rounded-xl object-cover" />
                <span>
                  <span className="block font-extrabold">{o.title}</span>
                  <span className="mt-1 block text-xs font-medium text-muted">{o.body}</span>
                </span>
              </Link>
            </Reveal>
            );
          })}
        </div>
      </section>
      ) : null}

      <section className="stat-row mx-auto max-w-6xl px-4 py-4">
        {[
          ["24/7", "Support"],
          ["5", "SIM networks"],
          ["₦", "Naira wallet"],
          ["1", "One wallet"],
        ].map(([n, l], i) => (
          <Reveal key={l} delay={i * 80}>
            <div className="rounded-card border border-line bg-card px-2 py-4 text-center shadow-card">
              <p className="text-xl font-extrabold text-primary sm:text-3xl">{n}</p>
              <p className="mt-1 text-[10px] font-bold text-muted sm:text-xs">{l}</p>
            </div>
          </Reveal>
        ))}
      </section>

      <section id="offer" className="mx-auto max-w-6xl px-4 py-8">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold">What we offer</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm font-medium text-muted">Numbers, data, logs and social services, filed the way people buy them.</p>
        </Reveal>
        {cards.length ? <div className="mt-8 grid gap-4 md:grid-cols-3">
          {cards.map((o, i) => {
            const slot = photoSlotFor(o.title);
            return (
            <Reveal key={o.id} delay={i * 90}>
              <article className="overflow-hidden rounded-card border border-line bg-card shadow-card">
                <SlotImage slot={slot} alt={altFor(slot)} photos={photos} sizes="(min-width: 768px) 33vw, 100vw" className="h-40 w-full object-cover" />
                <div className="p-5">
                  <h3 className="text-xl font-extrabold">{o.title}</h3>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-muted">{o.body}</p>
                  <Link to="/register" className="mt-4 inline-block text-sm font-extrabold text-primary">Get started</Link>
                </div>
              </article>
            </Reveal>
            );
          })}
        </div> : null}
      </section>

      <Reveal>
        <section className="relative overflow-hidden bg-deep text-on-deep">
          <span className="orb left-10 top-6 size-40 opacity-40" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 py-16 lg:grid-cols-2">
            <div>
              <p className="text-xs font-extrabold tracking-wide text-accent">Built for mobile</p>
              <h2 className="mt-2 text-4xl font-extrabold">Everything you need, inside one dashboard.</h2>
              <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-on-deep/80">Fund the wallet, buy a number or a SIM plan, and read the code on the same order.</p>
            </div>
            <div className="float-slow rounded-card bg-white/10 p-4">
              <div className="rounded-card bg-card p-5 text-ink shadow-card">
                <p className="text-xs font-extrabold text-primary">Available balance</p>
                <p className="mt-2 text-4xl font-extrabold">₦0.00</p>
                <p className="mt-2 text-sm font-medium text-muted">Top up from the wallet. Purchases deduct here.</p>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      <section id="why" className="mx-auto max-w-6xl px-4 py-14">
        <Reveal>
          <h2 className="text-center text-3xl font-extrabold">Why VeriLogs</h2>
          <p className="mt-2 text-center text-sm font-medium text-muted">Built for speed, a clear wallet, and catalogues that stay separate.</p>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {why.map((w, i) => (
            <Reveal key={w.title} delay={i * 70}>
              <article className="rounded-card border border-line bg-card p-5 shadow-card">
                <span className="grid size-11 place-items-center rounded-2xl bg-primary text-on-primary"><Glyph icon={w.icon} className="size-5" /></span>
                <h3 className="mt-3 text-lg font-extrabold">{w.title}</h3>
                <p className="mt-1 text-sm font-medium leading-relaxed text-muted">{w.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <HowItWorks />

      <Reveal>
        <section className="bg-deep py-16 text-center text-on-deep">
          <h2 className="text-4xl font-extrabold">Start the smarter way</h2>
          <p className="mt-2 text-sm font-medium text-on-deep/75">Numbers, data and digital services. One naira wallet.</p>
          <Link to="/register" className="mt-6 inline-block rounded-2xl bg-card px-6 py-3.5 text-sm font-extrabold text-ink">Create free account</Link>
        </section>
      </Reveal>
    </PublicFrame>
  );
}
