import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, Globe, Lock, Shield, Smartphone, Wallet, Zap, Headphones, Radio, Hash } from "lucide-react";
import { PublicFrame } from "@/components/chrome";
import { Logo } from "@/components/ui";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/")({ component: Home });

const offers = [
  { icon: Hash, title: "Virtual numbers", body: "SMS codes for WhatsApp, Telegram, Google and hundreds of other services. Each API you connect stays on its own server." },
  { icon: Radio, title: "Data & airtime", body: "MTN, Airtel, Glo, 9mobile and Smile are listed as separate SIM catalogues, not one mixed pile." },
  { icon: Smartphone, title: "Bills", body: "Cable TV, electricity and exam PINs from the same naira wallet." },
];

const why = [
  { icon: Lock, title: "Wallet stays in naira", body: "Fund once. Spend on numbers, data, airtime and bills without a new checkout each time." },
  { icon: Zap, title: "Instant delivery", body: "A number shows up on the order card. The SMS code lands on that same card." },
  { icon: Shield, title: "Servers stay apart", body: "Server 1 is your first SMS API. Server 2 is the next. Prices and stock are never merged." },
  { icon: Headphones, title: "Support at the bottom", body: "FAQ, support and community live in the footer and the help card, not floating over the shop." },
  { icon: BadgeCheck, title: "You publish what you want", body: "Imports arrive switched off. Turn on the services you actually sell." },
  { icon: Globe, title: "One catalogue, many categories", body: "A provider can send numbers and VTU together. VeriLogs files each item where it belongs." },
];

function Home() {
  const settings = useStore((s) => s.settings);
  const home = settings.home;
  return (
    <PublicFrame>
      <section className="mesh">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold text-primary">
              <BadgeCheck className="size-3.5" /> {home.eyebrow}
            </p>
            <h1 className="hero-title mt-4 text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">{home.title}</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
              {home.body}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/register" className="btn-gradient rounded-xl px-5 py-3 text-sm font-semibold">Create free account</Link>
              <a href="#offer" className="rounded-xl border border-line bg-card px-5 py-3 text-sm font-semibold">Explore services</a>
            </div>
            <ul className="mt-5 flex flex-wrap gap-4 text-xs font-medium text-muted">
              <li>Instant delivery</li>
              <li>200+ countries</li>
              <li>Naira wallet</li>
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <div className="rotate-3 rounded-card bg-primary p-8 shadow-card">
              <div className="-rotate-3 rounded-card bg-deep p-8 text-on-deep">
                <Logo />
                <p className="mt-6 text-2xl font-extrabold">Numbers, data and bills in one wallet.</p>
                <p className="mt-2 text-sm text-on-deep/80">Server 1, Server 2 and Server 3 stay on their own shelves.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {settings.banners.length ? (
        <section className="mx-auto grid max-w-6xl gap-3 px-4 pt-6 sm:grid-cols-2">
          {settings.banners.map((b) => (
            <a key={b.id} href={b.href || "/register"} className="rounded-card border border-line bg-card p-5 shadow-card">
              <p className="text-lg font-bold">{b.title}</p>
              <p className="mt-1 text-sm text-muted">{b.body}</p>
            </a>
          ))}
        </section>
      ) : null}

      <section className="mx-auto grid max-w-6xl gap-3 px-4 py-8 sm:grid-cols-4">
        {[
          ["100+", "Services ready to enable"],
          ["24/7", "Support"],
          ["5", "SIM networks, kept apart"],
          ["₦", "Naira wallet"],
        ].map(([n, l]) => (
          <div key={l} className="rounded-card border border-line bg-card px-4 py-5 text-center shadow-card">
            <p className="text-2xl font-extrabold text-deep">{n}</p>
            <p className="mt-1 text-xs text-muted">{l}</p>
          </div>
        ))}
      </section>

      <section id="offer" className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-center text-3xl font-extrabold">What we offer</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm text-muted">Services filed the way customers actually buy them.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {offers.map((o) => (
            <article key={o.title} className="rounded-card border border-line bg-card p-5 shadow-card">
              <span className="grid size-11 place-items-center rounded-xl bg-paper text-primary"><o.icon className="size-5" /></span>
              <h3 className="mt-4 text-lg font-bold">{o.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{o.body}</p>
              <Link to="/register" className="mt-4 inline-block text-sm font-semibold text-primary">Get started</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-deep text-on-deep">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold tracking-wide text-accent">Built for the dashboard</p>
            <h2 className="mt-2 text-3xl font-extrabold">Everything you need, inside one calm workspace.</h2>
            <p className="mt-3 text-sm leading-relaxed text-on-deep/80">Fund the wallet, pick a server, buy a number or a SIM plan, and read the code without hunting through a pile of buttons.</p>
            <Link to="/register" className="mt-5 inline-block rounded-xl bg-card px-5 py-3 text-sm font-semibold text-ink">Start now</Link>
          </div>
          <div className="rounded-card bg-primary/40 p-6">
            <div className="rounded-card bg-deep p-6">
              <Wallet className="size-8 text-accent" />
              <p className="mt-4 text-sm text-on-deep/70">Available balance</p>
              <p className="text-3xl font-extrabold">₦0.00</p>
              <p className="mt-2 text-xs text-on-deep/70">Top up from the wallet page. Purchases deduct here.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="why" className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-center text-3xl font-extrabold">Why VeriLogs</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {why.map((w) => (
            <article key={w.title} className="rounded-card border border-line bg-card p-5 shadow-card">
              <span className="grid size-10 place-items-center rounded-xl bg-paper text-primary"><w.icon className="size-5" /></span>
              <h3 className="mt-3 font-bold">{w.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{w.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="bg-card py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold">How it works</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              ["1", "Create account", "Sign up with email or Google. Google accounts still confirm a name and phone."],
              ["2", "Fund wallet", "Add naira. The balance is what you spend."],
              ["3", "Get access", "Pick a server or a SIM network. The number, code or recharge shows up on the order."],
            ].map(([n, t, b]) => (
              <div key={n} className="text-center">
                <span className="mx-auto grid size-10 place-items-center rounded-full bg-primary text-sm font-bold text-on-primary">{n}</span>
                <h3 className="mt-3 font-bold">{t}</h3>
                <p className="mt-1 text-sm text-muted">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-deep py-14 text-center text-on-deep">
        <h2 className="text-3xl font-extrabold">Start the smarter way</h2>
        <p className="mt-2 text-sm text-on-deep/80">Numbers, data and bills. One wallet. Naira.</p>
        <Link to="/register" className="mt-5 inline-block rounded-xl bg-card px-5 py-3 text-sm font-semibold text-ink">Create free account</Link>
      </section>
    </PublicFrame>
  );
}
