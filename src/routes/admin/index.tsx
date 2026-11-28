import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CATEGORY_LABEL, quoteProduct, type Provider } from "@/lib/catalog";
import { Button, Field, inputClass } from "@/components/ui";
import { naira, when } from "@/lib/money";
import { profitReport, catalogStats, adminCustomerCounts } from "@/lib/shop-fns";
import { useServers, useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

function AdminHome() {
  const providers = useStore((s) => s.providers);
  const orders = useStore((s) => s.orders);
  const users = useStore((s) => s.users);
  const tickets = useStore((s) => s.tickets);
  const setProvider = useStore((s) => s.setProvider);
  const servers = useServers();
  const [stats, setStats] = useState({ total: 0, live: 0, byCategory: {} as Record<string, number>, byProvider: {} as Record<string, { count: number; live: number }> });
  const [profit, setProfit] = useState<{ total: number; unverified: number; rows: Array<{ category: string; profit: number; orders: number }>; updatedAt: string } | null>(null);
  const [customers, setCustomers] = useState({ total: 0, today: 0, month: 0 });
  useEffect(() => {
    catalogStats().then((res) => { if (res) setStats(res); }).catch(() => undefined);
    profitReport().then((res) => { if (res.report) setProfit(res.report); }).catch(() => undefined);
    adminCustomerCounts().then((res) => { if (res) setCustomers(res); }).catch(() => undefined);
  }, [providers.length, orders.length]);
  const byCat = stats.byCategory;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Admin</h1>
        <p className="text-sm text-muted">Catalogue, wallets and orders. Profit below uses completed orders only.</p>
      </div>
      <section className="rounded-card border border-primary/30 bg-card p-5 shadow-card">
        <p className="text-xs font-bold tracking-wide text-muted">TOTAL BUSINESS PROFIT</p>
        <p className="mt-1 text-3xl font-extrabold">{naira(profit?.total || 0)}</p>
        <p className="mt-1 text-sm text-muted">Profit from completed orders. Deposits, waiting orders and refunds are not included. {profit?.unverified ? `${profit.unverified} completed orders have no provider cost and are not counted.` : "Every counted order had a stored provider cost."}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {(profit?.rows || []).map((row) => (
                <tr key={row.category} className="border-t border-line">
                  <td className="py-1">{row.category}</td>
                  <td className="py-1 text-right font-bold">{naira(row.profit)}</td>
                </tr>
              ))}
              <tr className="border-t border-line font-extrabold">
                <td className="py-1">TOTAL BUSINESS PROFIT</td>
                <td className="py-1 text-right">{naira(profit?.total || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <p className="text-xs font-bold tracking-wide text-muted">TOTAL CUSTOMERS</p>
        <p className="mt-1 text-3xl font-extrabold">{customers.total.toLocaleString("en-NG")}</p>
        <p className="mt-1 text-sm text-muted">Registered customer accounts in the database. Administrators and staff are not included. The same email is counted once. Deleted accounts are not included. Today and this month use Africa/Lagos (WAT, UTC+1).</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ["Total registered", customers.total],
            ["New today", customers.today],
            ["New this month", customers.month],
          ].map(([label, count]) => (
            <div key={String(label)} className="rounded-xl bg-paper px-3 py-2">
              <p className="text-xs text-muted">{label}</p>
              <p className="text-xl font-extrabold">{Number(count).toLocaleString("en-NG")}</p>
            </div>
          ))}
        </div>
        <Link to="/admin/deposits" className="mt-3 inline-block text-sm font-semibold text-primary">Wallet deposits</Link>
        <Link to="/admin/complaints" className="mt-2 block text-sm font-semibold text-primary">Complaints</Link>
      </section>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Imported", String(stats.total)],
          ["Live on shop", String(stats.live)],
          ["Waiting", String(Math.max(0, stats.total - stats.live))],
          ["Open tickets", String(tickets.length)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-card border border-line bg-card p-4 shadow-card">
            <p className="text-xs text-muted">{k}</p>
            <p className="text-2xl font-extrabold">{v}</p>
          </div>
        ))}
      </div>
      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Catalogue by category</h2>
          <Link to="/admin/catalog" className="text-sm font-semibold text-primary">Open catalogue</Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(byCat).map(([k, n]) => (
            <span key={k} className="rounded-full bg-paper px-3 py-1 text-sm">{CATEGORY_LABEL[k] || k}: {n}</span>
          ))}
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Providers and servers</h2>
          <Link to="/admin/import" className="text-sm font-semibold text-primary">Import</Link>
        </div>
        {providers.map((p) => {
          const label = servers.find((s) => s.id === p.id)?.label;
          const count = stats.byProvider[p.id]?.count || 0;
          const on = stats.byProvider[p.id]?.live || 0;
          return (
            <article key={p.id} className="rounded-card border border-line bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{label ? `${label} · ` : ""}{p.name}</p>
                  <p className="text-xs text-muted">{p.baseUrl} · {p.currency} · {on} live / {count} imported{p.servesNumbers ? "" : " · not an SMS server"}</p>
                </div>
                <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm font-semibold" onClick={() => { setProvider(p.id, { enabled: !p.enabled }); toast.success(p.enabled ? "Provider disabled. Its products stay off the shop." : "Provider enabled"); }}>
                  {p.enabled ? "Disable provider" : "Enable provider"}
                </button>
              </div>
              {p.importType === "NUMBER_IMPORT" && !label ? <p className="mt-2 text-xs text-muted">Not one of Server 1, Server 2 or Server 3. Its products and past orders were kept and were not moved.</p> : null}
              {p.lastSync ? (
                <p className="mt-2 text-xs text-muted">
                  Last sync {when(p.lastSync.at)} · {p.lastSync.imported} read · {p.lastSync.created} new · {p.lastSync.updated} updated
                  {p.lastSync.byNetwork && Object.keys(p.lastSync.byNetwork).length ? ` · networks ${Object.entries(p.lastSync.byNetwork).map(([n, c]) => `${n} ${c}`).join(", ")}` : ""}
                </p>
              ) : null}
              <ProviderMargin provider={p} />
            </article>
          );
        })}
      </section>
      <p className="text-xs text-muted">{customers.total.toLocaleString("en-NG")} customers · {orders.length} orders · your gain {naira(orders.reduce((sum, order) => sum + (order.status === "refunded" ? 0 : order.gain || 0), 0))} · wallet float {naira(users.reduce((s, u) => s + u.balance, 0))}</p>
    </div>
  );
}

function ProviderMargin({ provider }: { provider: Provider }) {
  const setProvider = useStore((s) => s.setProvider);
  const settings = useStore((s) => s.settings);
  const [rate, setRate] = useState(provider.usdRate || settings.usdNgn || 1343);
  const save = () => {
    setProvider(provider.id, {
      usdRate: Number(rate) || settings.usdNgn,
      currency: provider.currency === "NGN" ? "NGN" : "USD",
    });
    toast.success("Exchange rate saved");
  };
  const sample = quoteProduct(
    { id: "", providerId: provider.id, externalId: "", category: "number", name: "Sample", service: "Sample", country: "", network: "", price: 0, cost: provider.currency === "USD" ? 0.1 : 1000, stock: 0, operator: "", rate: 96, rates: "", enabled: true, validity: "", variable: false, description: "" },
    { providers: [{ ...provider, usdRate: Number(rate) || provider.usdRate }], settings },
  );
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <Field label="Naira per 1 USD"><input className={inputClass} inputMode="decimal" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></Field>
      <p className="text-xs text-muted sm:col-span-2">A {provider.currency === "USD" ? "$0.10" : "₦1,000"} provider cost sells at {naira(sample.price)} after the fixed profit. Success-rate percentages are not used.</p>
      <Button tone="soft" onClick={save}>Save exchange rate</Button>
    </div>
  );
}
