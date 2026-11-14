import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { BadgeCheck, Globe, Headphones, Lock, Radio, Shield, Smartphone, Zap } from "lucide-react";
import { PublicFrame } from "@/components/chrome";
import { PromoBanners } from "@/components/promos";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/")({ component: Home });

const offers = [
  { icon: Smartphone, title: "Virtual numbers", body: "SMS codes for WhatsApp, Telegram, Google and the other services you connect. Each API stays on its own server." },
  { icon: Radio, title: "Data and airtime", body: "MTN, Airtel, Glo, 9mobile and Smile stay as separate catalogues, with the price you set." },
  { icon: Globe, title: "Bills", body: "Cable, electricity and exam PINs from the same naira wallet." },
];

const why = [
  { icon: Shield, title: "Wallet stays in naira", body: "Fund once. Spend on numbers, data, airtime and bills." },
  { icon: Zap, title: "Instant delivery", body: "A number shows on the order. The SMS code lands on that same card." },
  { icon: Lock, title: "Servers stay apart", body: "Server 1 is the first number API. Server 2 is the next. Prices are never merged." },
  { icon: Headphones, title: "Support on the page", body: "FAQ, tickets and the Telegram channel sit with the shop, not in a separate app." },
  { icon: BadgeCheck, title: "You publish what you sell", body: "Imports arrive switched off until you turn a service on." },
  { icon: Globe, title: "One catalogue, filed properly", body: "Numbers, data, airtime and bills from one provider land on the right shelf." },
];

function Home() {
  const home = useStore((s) => s.settings.home);
  return (
    <PublicFrame>
      <section className="relative overflow-hidden">
        <span className="orb left-[-4rem] top-8 size-48 opacity-70" />
        <span className="orb right-[-3rem] top-24 size-56 opacity-60" style={{ animationDelay: "1.4s" }} />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:py-20">
          <p className="rise inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-bold text-primary">
            <BadgeCheck className="size-3.5" /> {home.eyebrow}
          </p>
          <h1 className="hero-title rise mt-5 text-4xl font-extrabold text-ink sm:text-6xl">{home.title}</h1>
          <p className="rise mx-auto mt-4 max-w-xl text-base font-medium leading-relaxed text-muted" style={{ animationDelay: "80ms" }}>{home.body}</p>
          <div className="rise mt-7 flex flex-wrap justify-center gap-3" style={{ animationDelay: "140ms" }}>
            <Link to="/register" className="btn-gradient rounded-2xl px-6 py-3.5 text-sm font-extrabold">Create free account</Link>
            <a href="#offer" className="rounded-2xl border border-line bg-card px-6 py-3.5 text-sm font-extrabold text-ink shadow-card">Explore services</a>
          </div>
          <ul className="rise mt-6 flex flex-wrap justify-center gap-2 text-xs font-bold text-ink" style={{ animationDelay: "200ms" }}>
            {["Instant delivery", "Naira wallet", "Servers kept apart"].map((item) => (
              <li key={item} className="rounded-full bg-card px-3 py-1.5 shadow-card">{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <PromoBanners />
      </section>

      <section className="mx-auto grid max-w-6xl gap-3 px-4 py-8 sm:grid-cols-4">
        {[
          ["24/7", "Support"],
          ["5", "SIM networks"],
          ["₦", "Naira wallet"],
          ["1", "Place for every server"],
        ].map(([n, l], i) => (
          <div key={l} className="rise rounded-card border border-line bg-card px-4 py-6 text-center shadow-card" style={{ animationDelay: `${i * 70}ms` }}>
            <p className="text-3xl font-extrabold text-primary">{n}</p>
            <p className="mt-1 text-xs font-bold text-muted">{l}</p>
          </div>
        ))}
      </section>

      <section id="offer" className="mx-auto max-w-6xl px-4 py-8">
        <h2 className="text-center text-3xl font-extrabold">What we offer</h2>
        <p className="mx-auto mt-2 max-w-xl text-center text-sm font-medium text-muted">Numbers, data, airtime and bills, filed the way people buy them.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {offers.map((o) => (
            <article key={o.title} className="rounded-card border border-line bg-card p-6 shadow-card">
              <span className="grid size-12 place-items-center rounded-2xl bg-primary text-on-primary"><o.icon className="size-5" /></span>
              <h3 className="mt-4 text-xl font-extrabold">{o.title}</h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-muted">{o.body}</p>
              <Link to="/register" className="mt-4 inline-block text-sm font-extrabold text-primary">Get started</Link>
            </article>
          ))}
        </div>
      </section>

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

      <section id="why" className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-center text-3xl font-extrabold">Why VeriLogs</h2>
        <p className="mt-2 text-center text-sm font-medium text-muted">Built for speed, a clear wallet, and catalogues that stay separate.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {why.map((w) => (
            <article key={w.title} className="rounded-card border border-line bg-card p-5 shadow-card">
              <span className="grid size-11 place-items-center rounded-2xl bg-primary text-on-primary"><w.icon className="size-5" /></span>
              <h3 className="mt-3 text-lg font-extrabold">{w.title}</h3>
              <p className="mt-1 text-sm font-medium leading-relaxed text-muted">{w.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="how" className="bg-card py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-extrabold">How it works</h2>
          <p className="mt-2 text-center text-sm font-medium text-muted">Three steps, then the shop is yours.</p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              ["1", "Create account", "Sign up with email or Google. A Google account still confirms a name and phone."],
              ["2", "Fund wallet", "Add naira. That balance is what you spend."],
              ["3", "Buy", "Pick a server or a network. The number, code or recharge shows on the order."],
            ].map(([n, t, b]) => (
              <div key={n} className="text-center">
                <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary text-sm font-extrabold text-on-primary">{n}</span>
                <h3 className="mt-3 text-lg font-extrabold">{t}</h3>
                <p className="mt-1 text-sm font-medium text-muted">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-deep py-16 text-center text-on-deep">
        <h2 className="text-4xl font-extrabold">Start the smarter way</h2>
        <p className="mt-2 text-sm font-medium text-on-deep/75">Numbers, data and bills. One naira wallet.</p>
        <Link to="/register" className="mt-6 inline-block rounded-2xl bg-card px-6 py-3.5 text-sm font-extrabold text-ink">Create free account</Link>
      </section>
    </PublicFrame>
  );
}
