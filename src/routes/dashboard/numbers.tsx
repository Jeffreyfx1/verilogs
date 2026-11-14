import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Copy, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { inputClass } from "@/components/ui";
import type { Product } from "@/lib/catalog";
import { naira, when } from "@/lib/money";
import { browseNumbers } from "@/lib/shop-fns";
import { useServers, useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/numbers")({
  validateSearch: (search: Record<string, unknown>) => ({
    server: typeof search.server === "string" ? search.server : "",
    country: typeof search.country === "string" ? search.country : "",
    kind: search.kind === "rent" ? "rent" : "",
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
  return FLAGS[name.toLowerCase()] || "🌐";
}

function countryHit(name: string, query: string) {
  const n = name.toLowerCase();
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
  const orders = useMemo(() => allOrders.filter((o) => o.userId === session && (o.category === "numbers" || o.category === "rent") && o.status === "waiting"), [allOrders, session]);
  const bought = useMemo(() => allOrders.filter((o) => o.userId === session && (o.category === "numbers" || o.category === "rent")).length, [allOrders, session]);
  const refund = useStore((s) => s.refund);
  const buy = useStore((s) => s.buy);
  const [buying, setBuying] = useState("");
  const activeId = liveServers.some((s) => s.id === server) ? server : liveServers[0]?.id || "";
  const active = servers.find((s) => s.id === activeId);
  const serverNo = Math.max(1, liveServers.findIndex((s) => s.id === activeId) + 1);
  const [countryName, setCountryName] = useState(lockedCountry);
  const [countryQ, setCountryQ] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [service, setService] = useState(preset);
  const [serviceQ, setServiceQ] = useState("");
  const [serviceOpen, setServiceOpen] = useState(false);
  const [countries, setCountries] = useState<Product[]>([]);
  const [services, setServices] = useState<{ service: string; price: number }[]>([]);
  const [operators, setOperators] = useState<Product[]>([]);
  const [picked, setPicked] = useState(false);
  const [loadingOps, setLoadingOps] = useState(false);
  const want = kind === "rent" ? "rent" : "numbers";

  useEffect(() => {
    let stop = false;
    browseNumbers({ data: { providerId: activeId, category: want, list: "countries" } })
      .then((res) => { if (!stop) setCountries(res.countries); })
      .catch(() => { if (!stop) setCountries([]); });
    return () => { stop = true; };
  }, [activeId, want]);

  useEffect(() => {
    if (!countryName) {
      setServices([]);
      return;
    }
    let stop = false;
    const timer = setTimeout(() => {
      browseNumbers({ data: { providerId: activeId, category: want, country: countryName, list: "services", q: serviceQ } })
        .then((res) => { if (!stop) setServices(res.services); })
        .catch(() => { if (!stop) setServices([]); });
    }, 200);
    return () => { stop = true; clearTimeout(timer); };
  }, [activeId, want, countryName, serviceQ]);

  const runSelect = (nextCountry: string, nextService: string) => {
    if (!nextCountry || !nextService) {
      toast.error("Pick a country and a service first.");
      return;
    }
    setPicked(true);
    setLoadingOps(true);
    setCountryOpen(false);
    setServiceOpen(false);
    browseNumbers({ data: { providerId: activeId, category: want, country: nextCountry, service: nextService, detail: true } })
      .then((res) => setOperators(res.operators))
      .catch(() => setOperators([]))
      .finally(() => setLoadingOps(false));
  };

  useEffect(() => {
    if (!preset || !lockedCountry) return;
    setCountryName(lockedCountry);
    setService(preset);
    setPicked(true);
    setLoadingOps(true);
    let stop = false;
    browseNumbers({ data: { providerId: activeId, category: want, country: lockedCountry, service: preset, detail: true } })
      .then((res) => { if (!stop) setOperators(res.operators); })
      .catch(() => { if (!stop) setOperators([]); })
      .finally(() => { if (!stop) setLoadingOps(false); });
    return () => { stop = true; };
  }, [preset, lockedCountry, activeId, want]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const shownCountries = countries.filter((c) => countryHit(c.country, countryQ)).slice(0, 40);
  const title = kind === "rent" ? "Rent a number" : lockedCountry === "United States" ? "USA numbers" : "Buy all countries";

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[1.4rem] bg-gradient-to-r from-cyan-400 via-teal-400 to-blue-600 p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-white/80">Wallet balance</p>
            <p className="text-3xl font-extrabold">{naira(user?.balance || 0)}</p>
            <p className="mt-2 text-xs font-bold">⚡ {bought} SMS purchased</p>
          </div>
          <Link to="/dashboard/wallet" className="rounded-full bg-white/20 px-3 py-1 text-xs font-extrabold">+ Fund wallet</Link>
        </div>
        <div className="mt-3 text-right">
          <Link to="/dashboard/history" hash="numbers" className="text-xs font-extrabold underline">View history →</Link>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <button type="button" onClick={() => { setCountryName("United States"); setPicked(false); setOperators([]); }} className={`shrink-0 rounded-full px-4 py-2 text-sm font-extrabold ${countryName === "United States" ? "bg-primary text-on-primary" : "bg-[#12081f] text-white"}`}>🇺🇸 USA</button>
        {liveServers.map((s) => (
          <Link key={s.id} to="/dashboard/numbers" search={{ server: s.id, country: lockedCountry, kind, service: preset }} className={`shrink-0 rounded-full px-4 py-2 text-sm font-extrabold ${s.id === activeId ? "bg-violet-600 text-white" : "bg-[#12081f] text-white"}`}>
            {s.label || s.name}
          </Link>
        ))}
      </div>
      {kind === "rent" ? null : <p className="text-xs font-extrabold text-violet-200">Note: England is the United Kingdom on this list.</p>}

      <section className="rounded-[1.4rem] border border-line bg-card p-4">
        <h1 className="text-xl font-extrabold">{title} <span className="text-sm text-primary">[{active?.label || `Server ${serverNo}`}]</span></h1>
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
                <button key={c.country} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary hover:text-on-primary" onClick={() => { setCountryName(c.country); setCountryQ(""); setCountryOpen(false); setService(""); setPicked(false); setOperators([]); }}>
                  <span>{flag(c.country)}</span>
                  <span className="flex-1">{c.country === "United States" ? "USA" : c.country}</span>
                  <span className="text-xs">from {naira(c.price)}</span>
                </button>
              ))}
              {!shownCountries.length ? <p className="px-3 py-3 text-sm text-muted">No country matches that search.</p> : null}
            </div>
          ) : null}
        </div>

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
                <button key={s.service} type="button" className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-primary hover:text-on-primary" onClick={() => { setService(s.service); setServiceQ(""); setServiceOpen(false); setPicked(false); setOperators([]); }}>
                  <span>{s.service}</span>
                  <span className="text-xs">from {naira(s.price)}</span>
                </button>
              ))}
              {countryName && !services.length ? <p className="px-3 py-3 text-sm text-muted">No service matches that search.</p> : null}
            </div>
          ) : null}
        </div>

        <button type="button" className="btn-gradient mt-4 w-full rounded-xl py-3 text-sm font-extrabold tracking-wide" onClick={() => runSelect(countryName, service)}>SELECT</button>

        {loadingOps ? <p className="mt-3 text-center text-sm text-muted">Loading operators…</p> : null}
        {picked && !loadingOps ? (
          <div className="mt-3 space-y-3">
            {operators.map((op) => (
              <article key={op.id} className="rounded-2xl border border-line bg-paper p-3">
                <p className="font-extrabold">{op.operator || "any"} <span className="text-sm font-bold text-ok">Stock: {op.stock.toLocaleString("en-US")}</span></p>
                <p className="text-lg font-extrabold text-ok">{naira(op.price)}</p>
                <button type="button" disabled={buying === op.id} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-2 text-sm font-extrabold text-white disabled:opacity-60" onClick={() => {
                  if ((user?.balance || 0) < op.price) {
                    toast.error("Insufficient balance. Top up your balance to make this purchase.");
                    return;
                  }
                  setBuying(op.id);
                  void buy(op.id, {}).then((err) => {
                    setBuying("");
                    if (err) toast.error(err);
                    else toast.success("Number reserved. Waiting for the SMS.");
                  });
                }}>
                  <ShoppingCart className="size-4" /> BUY
                </button>
              </article>
            ))}
            {!operators.length ? <p className="text-sm text-muted">No servers for {service} in {countryName}.</p> : null}
          </div>
        ) : null}
      </section>

      <section className="rounded-[1.4rem] bg-violet-300/15 p-4">
        <h2 className="text-lg font-extrabold">My active numbers</h2>
        <div className="mt-3 space-y-2">
          {orders.map((o) => (
            <article key={o.id} className="rounded-xl bg-card p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="font-extrabold">{o.title}</p>
                <span className="text-xs text-muted">{o.server}</span>
              </div>
              <p className="mt-1 font-mono">{o.phone}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="inline-flex items-center gap-1 text-xs font-extrabold text-primary" onClick={() => copy(o.phone)}><Copy className="size-3" /> Copy number</button>
                {o.code ? <button type="button" className="text-xs font-extrabold text-primary" onClick={() => copy(o.code)}>Code {o.code}</button> : <span className="text-xs text-muted">Waiting for SMS…</span>}
              </div>
              <p className="mt-1 text-xs text-muted">{when(o.createdAt)} · {naira(o.amount)}</p>
              <button type="button" className="mt-2 text-xs font-extrabold text-danger" onClick={async () => { const err = await refund(o.id); if (err) toast.error(err); else toast.success("Refunded to wallet"); }}>Cancel and refund</button>
            </article>
          ))}
          {!orders.length ? <p className="py-4 text-sm text-muted">No active numbers.</p> : null}
        </div>
      </section>
    </div>
  );
}
