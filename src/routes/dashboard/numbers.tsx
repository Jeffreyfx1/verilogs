import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button, inputClass } from "@/components/ui";
import { naira, when } from "@/lib/money";
import { isLive } from "@/lib/catalog";
import { useServers, useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/numbers")({
  validateSearch: (search: Record<string, unknown>) => ({
    server: typeof search.server === "string" ? search.server : "",
    country: typeof search.country === "string" ? search.country : "",
    kind: search.kind === "rent" ? "rent" : "",
  }),
  component: NumbersPage,
});

function NumbersPage() {
  const { server, country: lockedCountry, kind } = Route.useSearch();
  const user = useUser();
  const servers = useServers();
  const liveServers = servers.filter((s) => s.enabled);
  const products = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const allOrders = useStore((s) => s.orders);
  const session = useStore((s) => s.sessionUserId);
  const orders = useMemo(() => allOrders.filter((o) => o.userId === session && (o.category === "numbers" || o.category === "rent")), [allOrders, session]);
  const buy = useStore((s) => s.buy);
  const refund = useStore((s) => s.refund);
  const activeId = liveServers.some((s) => s.id === server) ? server : liveServers[0]?.id || "";
  const active = servers.find((s) => s.id === activeId);
  const [q, setQ] = useState("");
  const [service, setService] = useState("");
  const [country, setCountry] = useState("");

  const want = kind === "rent" ? "rent" : "numbers";
  const pool = products.filter((p) => p.providerId === activeId && p.category === want && isLive(p, providers) && p.country && p.country !== "Any");
  const unfiled = products.some((p) => p.providerId === activeId && (p.category === "numbers" || p.category === "rent") && isLive(p, providers) && (!p.country || p.country === "Any"));
  const hidden = products.filter((p) => p.providerId === activeId && p.category === want && !p.enabled).length;
  const services = useMemo(() => {
    const map = new Map<string, { service: string; price: number }>();
    for (const p of pool) {
      if (lockedCountry && p.country !== lockedCountry) continue;
      if (q && !p.service.toLowerCase().includes(q.toLowerCase())) continue;
      const cur = map.get(p.service);
      if (!cur || p.price < cur.price) map.set(p.service, { service: p.service, price: p.price });
    }
    return [...map.values()].sort((a, b) => a.service.localeCompare(b.service));
  }, [pool, q, lockedCountry]);
  const countries = useMemo(() => {
    const map = new Map<string, (typeof pool)[number]>();
    for (const p of pool) {
      if (p.service !== service) continue;
      if (lockedCountry && p.country !== lockedCountry) continue;
      const cur = map.get(p.country);
      if (!cur || (p.price > 0 && p.price < cur.price)) map.set(p.country, p);
    }
    return [...map.values()].sort((a, b) => a.price - b.price || a.country.localeCompare(b.country));
  }, [pool, service, lockedCountry]);
  const picked = countries.find((p) => p.country === country) || null;

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const purchase = async () => {
    if (!picked) return;
    const err = await buy(picked.id, {});
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
            {!services.length ? <p className="px-2 py-6 text-sm text-muted">{unfiled ? "Imported rows have no country, so they are hidden. Pull https://5sim.net/v1/guest/prices with currency USD." : kind === "rent" ? "No rentals are live on this server. Import a catalogue whose category is hosting or rent." : "Nothing is live on this server yet."}</p> : null}
          </div>
        </section>
        <section className="rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="font-bold">Country</h2>
          <p className="mt-1 text-xs text-muted">{service ? service : "Choose a service to see countries."}</p>
          <div className="mt-3 max-h-[70vh] space-y-1 overflow-y-auto pr-1">
            {countries.map((p) => (
              <button key={p.id} type="button" onClick={() => setCountry(p.country)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${country === p.country ? "bg-primary text-on-primary" : "hover:bg-paper"}`}>
                <span>{p.country}</span>
                <span className="text-xs">{naira(p.price)}{p.stock > 0 && p.stock < 10000 ? ` · ${p.stock}` : ""}</span>
              </button>
            ))}
            {service && !countries.length ? <p className="px-2 py-6 text-sm text-muted">No countries for that service.</p> : null}
          </div>
          <Button className="mt-3 w-full" disabled={!picked} onClick={purchase}>
            {picked ? `Buy ${picked.country} · ${naira(picked.price)}` : "Select a country"}
          </Button>
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
