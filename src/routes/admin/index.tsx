import { useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CATEGORY_LABEL, type Provider } from "@/lib/catalog";
import { Button, Field, inputClass } from "@/components/ui";
import { naira, when } from "@/lib/money";
import { useServers, useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/")({ component: AdminHome });

function AdminHome() {
  const products = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const orders = useStore((s) => s.orders);
  const users = useStore((s) => s.users);
  const tickets = useStore((s) => s.tickets);
  const setProvider = useStore((s) => s.setProvider);
  const servers = useServers();
  const live = products.filter((p) => p.enabled).length;
  const byCat = products.reduce<Record<string, number>>((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">Admin</h1>
        <p className="text-sm text-muted">Imports land switched off. The shop only shows what you enable, which is why a sync can say “imported” while the site still looks empty.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Imported", String(products.length)],
          ["Live on shop", String(live)],
          ["Waiting", String(products.length - live)],
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
          const count = products.filter((x) => x.providerId === p.id).length;
          const on = products.filter((x) => x.providerId === p.id && x.enabled).length;
          return (
            <article key={p.id} className="rounded-card border border-line bg-card p-4 shadow-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-bold">{label ? `${label} · ` : ""}{p.name}</p>
                  <p className="text-xs text-muted">{p.baseUrl} · {p.currency} · {on} live / {count} imported{p.servesNumbers ? "" : " · not an SMS server"}</p>
                </div>
                <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm font-semibold" onClick={() => setProvider(p.id, { enabled: !p.enabled })}>
                  {p.enabled ? "Disable provider" : "Enable provider"}
                </button>
              </div>
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
      <p className="text-xs text-muted">{users.filter((u) => u.role === "customer").length} customers · {orders.length} orders · wallet float {naira(users.reduce((s, u) => s + u.balance, 0))}</p>
    </div>
  );
}

function ProviderMargin({ provider }: { provider: Provider }) {
  const setProvider = useStore((s) => s.setProvider);
  const [rate, setRate] = useState(provider.usdRate || 2646);
  const [markup, setMarkup] = useState(provider.markup || 1.6);
  const [lines, setLines] = useState(Object.entries(provider.operatorMarkups || {}).map(([name, value]) => `${name} ${value}`).join("\n"));
  const five = /5sim/i.test(`${provider.name} ${provider.baseUrl}`);
  const sample = Math.ceil((0.1 * (Number(rate) || 0) * (Number(markup) || 1)) / 5) * 5;
  const save = () => {
    const operatorMarkups: Record<string, number> = {};
    for (const line of lines.split("\n")) {
      const match = line.trim().match(/^(\S+)\s+([0-9]*\.?[0-9]+)$/);
      if (match) operatorMarkups[match[1].toLowerCase()] = Number(match[2]);
    }
    setProvider(provider.id, { usdRate: Number(rate) || 2646, markup: Number(markup) || 1, currency: provider.currency === "NGN" ? "NGN" : "USD", operatorMarkups });
  };
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <Field label="Naira per 1 USD"><input className={inputClass} inputMode="decimal" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></Field>
      <Field label="Normal markup"><input className={inputClass} inputMode="decimal" value={markup} onChange={(e) => setMarkup(Number(e.target.value))} /></Field>
      {five ? (
        <Field label="Each 5sim server markup" hint="One server per line, for example virtual8 1.4. A server listed here does not use the normal markup.">
          <textarea className={inputClass} rows={4} value={lines} onChange={(e) => setLines(e.target.value)} placeholder={"virtual8 1.4\nvirtual63 1.8"} />
        </Field>
      ) : null}
      <p className="text-xs text-muted sm:col-span-2">$0.10 at the normal markup sells at {naira(sample)}. A listed server uses its own number instead.</p>
      <Button tone="soft" onClick={save}>Save this API margin</Button>
    </div>
  );
}
