import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button, inputClass } from "@/components/ui";
import type { Product } from "@/lib/catalog";
import { naira, when } from "@/lib/money";
import { browseNumbers } from "@/lib/shop-fns";
import { useServers, useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/numbers")({
  validateSearch: (search: Record<string, unknown>) => ({
    server: typeof search.server === "string" ? search.server : "",
    country: typeof search.country === "string" ? search.country : "",
    kind: search.kind === "rent" ? "rent" : "",
  }),
  component: NumbersPage,
});

function serverName(operator?: string) {
  if (!operator || operator.toLowerCase() === "any") return "Any server";
  const match = operator.match(/^(virtual|route)(\d+)$/i);
  if (!match) return operator;
  return `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()} ${match[2]}`;
}

function NumbersPage() {
  const { server, country: lockedCountry, kind } = Route.useSearch();
  const user = useUser();
  const servers = useServers();
  const liveServers = servers.filter((s) => s.enabled);
  const allOrders = useStore((s) => s.orders);
  const session = useStore((s) => s.sessionUserId);
  const orders = useMemo(() => allOrders.filter((o) => o.userId === session && (o.category === "numbers" || o.category === "rent") && o.status === "waiting"), [allOrders, session]);
  const buy = useStore((s) => s.buy);
  const refund = useStore((s) => s.refund);
  const activeId = liveServers.some((s) => s.id === server) ? server : liveServers[0]?.id || "";
  const active = servers.find((s) => s.id === activeId);
  const [q, setQ] = useState("");
  const [service, setService] = useState("");
  const [country, setCountry] = useState("");
  const [services, setServices] = useState<{ service: string; price: number }[]>([]);
  const [countries, setCountries] = useState<Product[]>([]);
  const [operators, setOperators] = useState<Product[]>([]);
  const [operatorId, setOperatorId] = useState("");
  const [hidden, setHidden] = useState(0);
  const [loading, setLoading] = useState(false);
  const want = kind === "rent" ? "rent" : "numbers";

  useEffect(() => {
    let stop = false;
    const timer = setTimeout(() => {
      setLoading(true);
      browseNumbers({ data: { providerId: activeId, category: want, country: lockedCountry, service: "", q } })
        .then((res) => {
          if (stop) return;
          setServices(res.services);
          setHidden(res.hidden);
        })
        .catch(() => {
          if (!stop) setServices([]);
        })
        .finally(() => {
          if (!stop) setLoading(false);
        });
    }, 250);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [activeId, want, lockedCountry, q]);

  useEffect(() => {
    if (!service) {
      setCountries([]);
      return;
    }
    let stop = false;
    browseNumbers({ data: { providerId: activeId, category: want, country: lockedCountry, service, q: "" } })
      .then((res) => {
        if (!stop) setCountries(res.countries);
      })
      .catch(() => {
        if (!stop) setCountries([]);
      });
    return () => {
      stop = true;
    };
  }, [activeId, want, lockedCountry, service]);
  const chosen = country || lockedCountry;
  useEffect(() => {
    if (!service || !chosen) {
      setOperators([]);
      setOperatorId("");
      return;
    }
    let stop = false;
    browseNumbers({ data: { providerId: activeId, category: want, country: chosen, service, detail: true } })
      .then((res) => {
        if (stop) return;
        setOperators(res.operators);
        setOperatorId(res.operators[0]?.id || "");
      })
      .catch(() => {
        if (!stop) setOperators([]);
      });
    return () => {
      stop = true;
    };
  }, [activeId, want, chosen, service]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const buyOperator = async (id: string) => {
    const op = operators.find((p) => p.id === id);
    setOperatorId(id);
    const err = await buy(id, {});
    if (err?.includes("does not cover") && op) {
      const due = Math.max(100, op.price - (user?.balance || 0));
      const label = `${serverName(op.operator)} · ${op.service || service}`;
      window.location.href = `/dashboard/wallet?amount=${due}&item=${encodeURIComponent(label)}`;
      return;
    }
    if (err) toast.error(err);
    else toast.success("Number reserved. The code appears on the card.");
  };

  return (
    <div className="space-y-4">
      <section className="balance-card flex flex-wrap items-center justify-between gap-3 rounded-card px-5 py-4">
        <div>
          <h1 className="text-2xl font-extrabold">{lockedCountry === "United States" ? (kind === "rent" ? "Rent USA numbers" : "USA numbers") : kind === "rent" ? "Rent numbers" : "Buy numbers"}</h1>
          <p className="text-sm text-on-deep/80">{active ? `${active.label} · ${active.name}` : "No SMS server is switched on yet."}</p>
        </div>
        <div className="rounded-xl bg-deep/30 px-4 py-2 text-right">
          <p className="text-xs">Wallet balance</p>
          <p className="text-lg font-bold">{naira(user?.balance || 0)}</p>
        </div>
      </section>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {liveServers.map((s) => (
          <Link
            key={s.id}
            to="/dashboard/numbers"
            search={{ server: s.id, country: lockedCountry, kind }}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${s.id === activeId ? "bg-primary text-on-primary" : "border border-line bg-card"}`}
          >
            {s.label}
          </Link>
        ))}
      </div>
      <div className="flex gap-2">
        <Link to="/dashboard/numbers" search={{ server: activeId, country: lockedCountry, kind: "" }} className={`rounded-full px-4 py-2 text-sm font-extrabold ${kind !== "rent" ? "bg-primary text-on-primary" : "border border-line bg-card"}`}>Buy number</Link>
        <Link to="/dashboard/numbers" search={{ server: activeId, country: lockedCountry, kind: "rent" }} className={`rounded-full px-4 py-2 text-sm font-extrabold ${kind === "rent" ? "bg-primary text-on-primary" : "border border-line bg-card"}`}>Rent number</Link>
      </div>
      {user?.role === "admin" && hidden > 0 ? (
        <p className="rounded-xl border border-line bg-card px-3 py-2 text-sm">
          {hidden} services on this server are imported but switched off, so customers cannot see them. Enable them in the catalogue.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="font-bold">Service</h2>
          <input className={`${inputClass} mt-3`} placeholder="Search service" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {services.map((s) => (
              <button key={s.service} type="button" onClick={() => { setService(s.service); setCountry(""); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${service === s.service ? "bg-primary text-on-primary" : "hover:bg-paper"}`}>
                <span>{s.service}</span>
                <span className="text-xs">from {naira(s.price)}</span>
              </button>
            ))}
            {!services.length ? <p className="px-2 py-6 text-sm text-muted">{loading ? "Loading services…" : q ? "No service matches that search." : kind === "rent" ? "No rentals are live on this server." : "Nothing is live on this server yet. Search a service such as WhatsApp."}</p> : null}
          </div>
        </section>
        <section className="rounded-card border border-line bg-card p-4 shadow-card">
          {chosen && service ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-bold">Select operator</h2>
                {lockedCountry ? null : (
                  <button type="button" className="text-sm font-semibold text-primary" onClick={() => { setCountry(""); setOperatorId(""); }}>Countries</button>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">{service} · {chosen}. Highest success is marked. Prices can move.</p>
              <div className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                {operators.map((op) => {
                  const best = (op.rate || 0) > 0 && op.rate === Math.max(...operators.map((item) => item.rate || 0));
                  return (
                    <article key={op.id} className={`rounded-2xl border p-3 ${operatorId === op.id ? "border-primary" : "border-line"}`}>
                      {best ? <span className="mb-2 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-primary">BEST RATE</span> : null}
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-extrabold">{serverName(op.operator)}</p>
                          <p className="mt-1 text-xs text-muted">{op.rate ? `${op.rate}% success` : "No recent rate"}{op.stock > 0 ? ` · ${op.stock.toLocaleString("en-US")} numbers` : ""}</p>
                          {op.rates ? <p className="mt-1 text-xs text-muted">{op.rates}</p> : null}
                        </div>
                        <p className="text-lg font-extrabold">{naira(op.price)}</p>
                        <Button className="shrink-0 px-3" onClick={() => { setOperatorId(op.id); void buyOperator(op.id); }}>Buy</Button>
                      </div>
                    </article>
                  );
                })}
                {!operators.length ? <p className="px-2 py-6 text-sm text-muted">No operators for {chosen} yet. In admin, pull https://5sim.net/v1/guest/prices again so each server and its success rate is saved.</p> : null}
              </div>
            </>
          ) : (
            <>
              <h2 className="font-bold">Country</h2>
              <p className="mt-1 text-xs text-muted">{service ? "Tap a country to see its servers and success rates." : "Choose a service to see countries."}</p>
              <div className="mt-3 max-h-[70vh] space-y-1 overflow-y-auto pr-1">
                {countries.map((p) => (
                  <button key={p.country} type="button" onClick={() => { setCountry(p.country); setOperatorId(""); }} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-paper">
                    <span>{p.country}</span>
                    <span className="text-xs">from {naira(p.price)}</span>
                  </button>
                ))}
                {service && !countries.length ? <p className="px-2 py-6 text-sm text-muted">No countries for that service.</p> : null}
              </div>
            </>
          )}
        </section>
        <section className="rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="font-bold">Active numbers</h2>
          <p className="mt-1 text-xs text-muted">This list scrolls. Cancel a waiting order to return the naira.</p>
          <div className="scroll-pane mt-3 space-y-2 pr-1">
            {orders.map((o) => (
              <article key={o.id} className="rounded-xl bg-paper p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{o.title}</p>
                  <span className="text-xs text-muted">{o.server}</span>
                </div>
                <p className="mt-1 font-mono">{o.phone}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary" onClick={() => copy(o.phone)}><Copy className="size-3" /> Copy number</button>
                  {o.code ? <button type="button" className="text-xs font-semibold text-primary" onClick={() => copy(o.code)}>Code {o.code}</button> : <span className="text-xs text-muted">{o.status === "waiting" ? "Waiting for SMS…" : o.status}</span>}
                </div>
                <p className="mt-1 text-xs text-muted">{when(o.createdAt)} · {naira(o.amount)}</p>
                {o.status === "waiting" ? (
                  <button type="button" className="mt-2 text-xs font-semibold text-danger" onClick={async () => { const err = await refund(o.id); if (err) toast.error(err); else toast.success("Refunded to wallet"); }}>Cancel and refund</button>
                ) : null}
              </article>
            ))}
            {!orders.length ? <p className="py-6 text-sm text-muted">No active numbers.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
