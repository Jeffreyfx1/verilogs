import { useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Glyph, glyph } from "@/components/icons";
import { toast } from "sonner";
import { BtnSpinner, inputClass } from "@/components/ui";
import type { Product } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { browseNumbers } from "@/lib/shop-fns";
import { restoreSlot, type NumberSlot } from "@/lib/number-slots";
import { withTimeout } from "@/lib/with-timeout";
import { useServers, useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/numbers")({
  validateSearch: (search: Record<string, unknown>) => ({
    server: typeof search.server === "string" ? search.server : "",
    country: typeof search.country === "string" ? search.country : "",
    kind: search.kind === "rent" ? "rent" : search.kind === "usa" ? "usa" : "",
    service: typeof search.service === "string" ? search.service : "",
  }),
  component: NumbersPage,
});

const FLAGS: Record<string, string> = {
  "united states": "🇺🇸", usa: "🇺🇸", "united kingdom": "🇬🇧", england: "🇬🇧", uk: "🇬🇧",
  canada: "🇨🇦", nigeria: "🇳🇬", france: "🇫🇷", germany: "🇩🇪", india: "🇮🇳",
  brazil: "🇧🇷", mexico: "🇲🇽", spain: "🇪🇸", italy: "🇮🇹", netherlands: "🇳🇱",
  poland: "🇵🇱", russia: "🇷🇺", china: "🇨🇳", japan: "🇯🇵", "south africa": "🇿🇦",
  ghana: "🇬🇭", kenya: "🇰🇪", australia: "🇦🇺", indonesia: "🇮🇩", turkey: "🇹🇷",
  ukraine: "🇺🇦", philippines: "🇵🇭", pakistan: "🇵🇰", egypt: "🇪🇬", morocco: "🇲🇦",
};

function flag(name: string) {
  return FLAGS[String(name || "").toLowerCase()] || "🌐";
}

function countryHit(name: string, query: string) {
  const n = String(name || "").toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (n.includes(q)) return true;
  if (n === "united states" && ("usa".startsWith(q) || "united states".includes(q))) return true;
  if (n === "united kingdom" && (q === "uk" || q === "england" || "england".startsWith(q))) return true;
  return false;
}

function NumbersPage() {
  const { server, country: lockedCountry, kind, service: preset } = Route.useSearch();
  const user = useUser();
  const servers = useServers();
  const liveServers = servers.filter((s) => s.enabled);
  const allOrders = useStore((s) => s.orders);
  const session = useStore((s) => s.sessionUserId);
  const orders = useMemo(() => allOrders.filter((o) => o.userId === session && o.server !== "Rent number" && (o.category === "numbers" || o.category === "rent" || o.category === "number" || o.category === "usa") && o.status === "waiting"), [allOrders, session]);
  const bought = useMemo(() => allOrders.filter((o) => o.userId === session && o.server !== "Rent number" && (o.category === "numbers" || o.category === "rent" || o.category === "number" || o.category === "usa")).length, [allOrders, session]);
  const buy = useStore((s) => s.buy);
  const tick = useStore((s) => s.tickWaiting);
  const nav = useNavigate();
  const [buying, setBuying] = useState("");
  const usa = kind === "usa";
  const activeId = usa ? "" : liveServers.some((s) => s.id === server) ? server : liveServers[0]?.id || "";
  const active = servers.find((s) => s.id === activeId);
  const slotKey = usa ? "usa" : activeId || "none";
  const memory = useRef<Record<string, NumberSlot>>({});
  const seeded = useRef(false);
  if (!seeded.current) {
    seeded.current = true;
    memory.current[slotKey] = { country: usa ? "usa" : lockedCountry, service: preset };
  }
  const [countryName, setCountryName] = useState(memory.current[slotKey]?.country || (usa ? "usa" : ""));
  const [countryQ, setCountryQ] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [service, setService] = useState(memory.current[slotKey]?.service || "");
  const [serviceQ, setServiceQ] = useState("");
  const [serviceOpen, setServiceOpen] = useState(false);
  const [countries, setCountries] = useState<Product[]>([]);
  const [services, setServices] = useState<{ service: string; price: number }[]>([]);
  const [operators, setOperators] = useState<Product[]>([]);
  const [picked, setPicked] = useState(false);
  const [loadingOps, setLoadingOps] = useState(false);
  const [loadingServices, setLoadingServices] = useState(false);
  const [countriesReady, setCountriesReady] = useState(false);
  const [opsError, setOpsError] = useState("");
  const [notice, setNotice] = useState("");
  const want = usa ? "usa" : kind === "rent" ? "rent" : "number";
  const countryGen = useRef(0);
  const serviceGen = useRef(0);
  const opGen = useRef(0);

  useEffect(() => { tick(); }, [tick]);

  const remember = (country: string, nextService: string) => {
    memory.current[slotKey] = { country, service: nextService };
    setCountryName(country);
    setService(nextService);
  };

  useEffect(() => {
    if (kind !== "rent") return;
    void nav({ to: "/dashboard/rent", replace: true });
  }, [kind, nav]);

  useEffect(() => {
    const slot = memory.current[slotKey] || { country: usa ? "usa" : "", service: "" };
    setCountryName(usa ? "usa" : slot.country);
    setService(slot.service);
    setCountryQ("");
    setServiceQ("");
    setCountryOpen(false);
    setServiceOpen(false);
    setOperators([]);
    setCountries([]);
    setServices([]);
    setPicked(false);
    setOpsError("");
    setNotice("");
    setLoadingOps(false);
    setCountriesReady(usa);
  }, [slotKey, usa]);

  useEffect(() => {
    const token = ++countryGen.current;
    if (usa || kind === "rent") return;
    browseNumbers({ data: { providerId: activeId, category: want, list: "countries" } })
      .then((res) => {
        if (token !== countryGen.current) return;
        const list = Array.isArray(res?.countries) ? res.countries : [];
        setCountries(list);
        setCountriesReady(true);
        const saved = memory.current[slotKey];
        const country = restoreSlot(saved, list.map((row) => row.country), [], "").country;
        if (saved?.country && !country) {
          memory.current[slotKey] = { country: "", service: "" };
          setCountryName("");
          setService("");
          setPicked(false);
          setOperators([]);
          setNotice("That country is not on this server. Choose another.");
        } else if (country && country !== saved?.country) {
          memory.current[slotKey] = { country, service: saved?.service || "" };
          setCountryName(country);
        }
      })
      .catch(() => {
        if (token !== countryGen.current) return;
        setCountries([]);
        setCountriesReady(true);
      });
    return () => { countryGen.current += 1; };
  }, [activeId, want, usa, slotKey, kind]);

  useEffect(() => {
    const token = ++serviceGen.current;
    if (kind === "rent" || !countryName) {
      setServices([]);
      setLoadingServices(false);
      return;
    }
    setLoadingServices(true);
    const timer = setTimeout(() => {
      withTimeout(browseNumbers({ data: { providerId: activeId, category: want, country: countryName, list: "services", q: serviceQ } }))
        .then((res) => {
          if (token !== serviceGen.current) return;
          const list = Array.isArray(res?.services) ? res.services : [];
          setServices(list);
          if (serviceQ.trim()) return;
          const saved = memory.current[slotKey];
          const next = restoreSlot(saved, [countryName], list.map((row) => row.service), usa ? "usa" : "");
          if (saved?.service && !next.service) {
            memory.current[slotKey] = { country: next.country || countryName, service: "" };
            setService("");
            setPicked(false);
            setOperators([]);
            setNotice("That service is not on this server. Choose another.");
          } else if (next.service && next.service !== service) {
            setService(next.service);
          }
        })
        .catch(() => {
          if (token !== serviceGen.current) return;
          setServices([]);
        })
        .finally(() => {
          if (token === serviceGen.current) setLoadingServices(false);
        });
    }, 200);
    return () => { serviceGen.current += 1; clearTimeout(timer); };
  }, [activeId, want, countryName, serviceQ, slotKey, usa, service, kind]);

  const runSelect = (nextCountry: string, nextService: string) => {
    if (!nextCountry || !nextService) {
      toast.error("Pick a country and a service first.");
      return;
    }
    const token = ++opGen.current;
    setPicked(true);
    setLoadingOps(true);
    setOpsError("");
    setNotice("");
    setCountryOpen(false);
    setServiceOpen(false);
    memory.current[slotKey] = { country: nextCountry, service: nextService };
    withTimeout(browseNumbers({ data: { providerId: activeId, category: want, country: nextCountry, service: nextService, detail: true } }))
      .then((res) => {
        if (token !== opGen.current) return;
        setOperators(Array.isArray(res?.operators) ? res.operators : []);
      })
      .catch((err: unknown) => {
        if (token !== opGen.current) return;
        setOperators([]);
        setOpsError(err instanceof Error && err.message === "timeout" ? "The server list took too long." : "Could not load servers.");
      })
      .finally(() => {
        if (token === opGen.current) setLoadingOps(false);
      });
  };

  if (kind === "rent") return <p className="text-sm text-muted">Opening Rent numbers…</p>;

  const shownCountries = countries.filter((c) => countryHit(c.country, countryQ)).slice(0, 40);
  const title = usa ? "USA Services" : kind === "rent" ? "Rent a number" : "Buy a number";

  return (
    <div className="space-y-4">
      <section className="wallet-band overflow-hidden rounded-[1.85rem] bg-gradient-to-r from-cyan-400 via-teal-400 to-blue-600 px-5 py-5 text-white shadow-[0_12px_30px_rgba(8,50,74,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-white/80">Wallet balance</p>
            <p className="text-4xl font-extrabold tracking-tight">{naira(user?.balance || 0)}</p>
            <p className="mt-2 text-xs font-bold">⚡ {bought} SMS purchased</p>
          </div>
          <Link to="/dashboard/wallet" className="rounded-full bg-white/20 px-3 py-1.5 text-xs font-extrabold">+ Fund wallet</Link>
        </div>
        <div className="mt-3 text-right">
          <Link to="/dashboard/history" hash="numbers" className="text-xs font-extrabold underline">View history →</Link>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Link to="/dashboard/numbers" search={{ server: "", country: "", kind: "usa", service: "" }} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-extrabold ${usa ? "border-primary bg-primary text-on-primary" : "border-line bg-card text-ink"}`}>USA</Link>
        {liveServers.map((s) => (
          <Link key={s.id} to="/dashboard/numbers" search={{ server: s.id, country: "", kind: kind === "rent" ? "rent" : "", service: "" }} className={`shrink-0 rounded-full border px-4 py-2 text-sm font-extrabold ${!usa && s.id === activeId ? "border-primary bg-primary text-on-primary" : "border-line bg-card text-ink"}`}>
            {s.label || "Server"}
          </Link>
        ))}
      </div>
      {usa ? <p className="text-sm text-muted">Browse available USA services.</p> : kind === "rent" ? null : <p className="text-xs font-extrabold text-muted">England is listed as the United Kingdom.</p>}

      <section className="rounded-[1.4rem] border border-line bg-card p-4">
        <h1 className="text-xl font-extrabold">{title} {usa ? null : <span className="text-sm text-primary">[{active?.label || "Server"}]</span>}</h1>
        {usa || !countriesReady ? null : !countries.length ? <p className="mt-3 text-sm text-muted">No products available yet. Please check back later.</p> : null}
        {usa ? null : (
        <>
        <label className="mt-4 block text-sm font-extrabold">Country</label>
        <div className="relative mt-1">
          <input
            className={inputClass}
            placeholder="Search country..."
            value={countryOpen ? countryQ : countryName ? `${flag(countryName)} ${countryName === "United States" ? "USA" : countryName}` : ""}
            onFocus={() => { setCountryOpen(true); setCountryQ(""); }}
            onChange={(e) => { setCountryQ(e.target.value); setCountryOpen(true); }}
          />
          {countryOpen ? (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-card shadow-card">
              {shownCountries.map((c) => (
                <button key={c.country} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary hover:text-on-primary" onClick={() => { remember(c.country, ""); setCountryQ(""); setCountryOpen(false); setPicked(false); setOperators([]); setNotice(""); }}>
                  <span>{flag(c.country)}</span>
                  <span className="flex-1">{c.country === "United States" ? "USA" : c.country}</span>
                  <span className="text-xs">from {naira(c.price)}</span>
                </button>
              ))}
              {!shownCountries.length ? <p className="px-3 py-3 text-sm text-muted">{countryQ ? "No country matches that search." : "No products available yet. Please check back later."}</p> : null}
            </div>
          ) : null}
        </div>
        </>
        )}

        <label className="mt-4 block text-sm font-extrabold">Service</label>
        <div className="relative mt-1">
          <input
            className={inputClass}
            placeholder="Search service..."
            value={serviceOpen ? serviceQ : service}
            onFocus={() => { setServiceOpen(true); setServiceQ(""); }}
            onChange={(e) => { setServiceQ(e.target.value); setServiceOpen(true); setService(""); setPicked(false); }}
          />
          {serviceOpen ? (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-line bg-card shadow-card">
              {!countryName ? <p className="px-3 py-3 text-sm text-muted">Pick a country first.</p> : null}
              {services.map((s) => (
                <button key={s.service} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-primary hover:text-on-primary" onClick={() => { remember(countryName, s.service); setServiceQ(""); setServiceOpen(false); setPicked(false); setOperators([]); setNotice(""); }}>
                  <span>{s.service}</span>
                  <span className="text-xs">from {naira(s.price)}</span>
                </button>
              ))}
              {usa && !loadingServices && !services.length ? <p className="px-3 py-3 text-sm text-muted">No USA services available at the moment. Please check back later.</p> : null}
              {!usa && countryName && !loadingServices && !services.length ? <p className="px-3 py-3 text-sm text-muted">{serviceQ.trim() ? "No service matches that search." : "No services are available for this country on this server."}</p> : null}
            </div>
          ) : null}
        </div>
        {notice ? <p className="mt-2 text-sm text-muted">{notice}</p> : null}

        <button type="button" disabled={loadingOps} className="btn-gradient mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-extrabold tracking-wide disabled:opacity-60" onClick={() => { if (!loadingOps) runSelect(countryName, service); }}>
          {loadingOps ? <BtnSpinner /> : null}
          {loadingOps ? "Loading servers…" : "SELECT"}
        </button>

        {loadingOps ? (
          <div className="mt-3 space-y-3" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <div key={n} className="skeleton-card">
                <div className="sk w-40" />
                <div className="sk mt-2 w-24" />
                <div className="sk sk-btn mt-3" />
              </div>
            ))}
          </div>
        ) : null}
        {opsError && !loadingOps ? <p className="mt-3 text-center text-sm font-semibold text-danger">{opsError} Tap select to try again.</p> : null}
        {picked && !loadingOps ? (
          <div className="mt-3 space-y-3">
            {operators.map((op) => (
              <article key={op.id} className="rounded-2xl border border-line bg-paper p-3">
                <p className="font-extrabold">{op.operator || "any"} <span className="text-sm font-bold text-ok">Stock: {op.stock.toLocaleString("en-US")}</span></p>
                {op.rate > 0 ? <p className="text-xs font-bold text-muted">Success {op.rate}%</p> : op.rates ? <p className="text-xs font-bold text-muted">{op.rates}</p> : null}
                <p className="text-lg font-extrabold text-ok">{naira(op.price)}</p>
                <button type="button" disabled={!!buying} className="btn-accent mt-2 inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-extrabold text-white disabled:opacity-60" onClick={() => {
                  if (buying) return;
                  if ((user?.balance || 0) < op.price) {
                    toast.error("Insufficient balance. Top up your balance to make this purchase.");
                    return;
                  }
                  setBuying(op.id);
                  void buy(op.id, {}).then((res) => {
                    setBuying("");
                    if (res.error) toast.error(res.error);
                    else if (res.orderId) nav({ to: "/purchase-result/$orderId", params: { orderId: res.orderId } });
                    else toast.success("Number reserved.");
                  });
                }}>
                  {buying === op.id ? <BtnSpinner /> : <Glyph icon={glyph.cart} className="size-4" />} {buying === op.id ? "Buying" : "BUY"}
                </button>
              </article>
            ))}
            {!operators.length ? <p className="text-sm text-muted">No servers for {service} in {countryName}.</p> : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-[1.4rem] bg-[#E5F2F8] p-4">
        <h2 className="text-lg font-extrabold">Active numbers</h2>
        <p className="mt-1 text-xs text-muted">Numbers still waiting. Open one for the SMS, timer and cancellation.</p>
        <div className="mt-3 space-y-2">
          {orders.map((o) => (
            <Link key={o.id} to="/purchase-result/$orderId" params={{ orderId: o.id }} className="block rounded-xl bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-extrabold">{o.phone || o.title}</p>
                <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-extrabold text-amber-800">{o.providerStatus || o.status}</span>
              </div>
              <p className="mt-1 text-xs text-muted">{[o.country, o.service || o.title, o.server].filter(Boolean).join(" · ")}</p>
              <Remain expiresAt={o.expiresAt} />
            </Link>
          ))}
          {!orders.length ? <p className="py-4 text-sm text-muted">No active numbers.</p> : null}
        </div>
      </section>
    </div>
  );
}

function Remain({ expiresAt }: { expiresAt?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return null;
  const left = Math.max(0, Math.floor((end - now) / 1000));
  const minutes = Math.floor(left / 60);
  const seconds = left % 60;
  return <p className="mt-1 text-xs font-extrabold text-primary">{left ? `${minutes}:${String(seconds).padStart(2, "0")} left` : "Timer ended. Status is being checked."}</p>;
}
