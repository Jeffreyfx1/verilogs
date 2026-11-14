import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button, inputClass } from "@/components/ui";
import { CATEGORY_LABEL } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { useServers, useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/catalog")({ component: CatalogPage });

const CATS = ["", "numbers", "rent", "data", "airtime", "cable", "electricity", "exam", "giftcard", "betting", "other"];

function CatalogPage() {
  const products = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const servers = useServers();
  const setEnabled = useStore((s) => s.setEnabled);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [provider, setProvider] = useState("");
  const [net, setNet] = useState("");
  const [only, setOnly] = useState<"all" | "off" | "on">("all");
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);

  const networks = useMemo(() => [...new Set(products.map((p) => p.network).filter(Boolean))].sort(), [products]);
  const filtered = useMemo(() => products.filter((p) => {
    if (cat && p.category !== cat) return false;
    if (provider && p.providerId !== provider) return false;
    if (net && p.network !== net) return false;
    if (only === "on" && !p.enabled) return false;
    if (only === "off" && p.enabled) return false;
    if (q) {
      const blob = `${p.name} ${p.service} ${p.country} ${p.network}`.toLowerCase();
      if (!blob.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [products, cat, provider, net, only, q]);
  const slice = filtered.slice(page * 40, page * 40 + 40);
  const pages = Math.max(1, Math.ceil(filtered.length / 40));

  const labelFor = (id: string) => {
    const server = servers.find((s) => s.id === id);
    const providerName = providers.find((p) => p.id === id)?.name || "Provider";
    return server ? `${server.label} · ${providerName}` : providerName;
  };

  const toggle = (id: string) => setPicked((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  const apply = (ids: string[], enabled: boolean) => {
    setEnabled(ids, enabled);
    setPicked([]);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Catalogue</h1>
        <p className="text-sm text-muted">{filtered.length} matching · {products.filter((p) => p.enabled).length} live of {products.length} imported. Enable a row to show it on the shop.</p>
      </div>
      <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
        <input className={inputClass} placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <select className={inputClass} value={cat} onChange={(e) => { setCat(e.target.value); setPage(0); }}>
          {CATS.map((c) => <option key={c || "all"} value={c}>{c ? CATEGORY_LABEL[c] : "All categories"}</option>)}
        </select>
        <select className={inputClass} value={provider} onChange={(e) => { setProvider(e.target.value); setPage(0); }}>
          <option value="">All providers</option>
          {providers.map((p) => <option key={p.id} value={p.id}>{labelFor(p.id)}</option>)}
        </select>
        <select className={inputClass} value={net} onChange={(e) => { setNet(e.target.value); setPage(0); }}>
          <option value="">All networks</option>
          {networks.map((n) => <option key={n}>{n}</option>)}
        </select>
        <select className={inputClass} value={only} onChange={(e) => { setOnly(e.target.value as typeof only); setPage(0); }}>
          <option value="all">Live and off</option>
          <option value="off">Switched off</option>
          <option value="on">Live</option>
        </select>
        <Button tone="soft" onClick={() => apply(filtered.map((p) => p.id), only !== "on")}>{only === "on" ? "Disable this filter" : "Enable this filter"}</Button>
      </div>
      {picked.length ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => apply(picked, true)}>Enable {picked.length}</Button>
          <Button tone="soft" onClick={() => apply(picked, false)}>Disable {picked.length}</Button>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-card border border-line bg-card">
        <div className="scroll-tall">
          {slice.map((p) => (
            <div key={p.id} className="flex items-start gap-3 border-b border-line px-3 py-3 text-sm">
              <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} className="mt-1" aria-label={`Select ${p.name}`} />
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{p.name}</span>
                <span className="mt-0.5 block text-xs text-muted">{CATEGORY_LABEL[p.category]} · {labelFor(p.providerId)} · {[p.country, p.network, p.service].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold">{p.variable ? "Variable" : naira(p.price)}</span>
                <button type="button" className={`text-xs font-semibold ${p.enabled ? "text-ok" : "text-muted"}`} onClick={() => setEnabled([p.id], !p.enabled)}>{p.enabled ? "Live" : "Off"}</button>
              </span>
            </div>
          ))}
          {!slice.length ? <p className="p-6 text-sm text-muted">No rows match.</p> : null}
        </div>
      </div>
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="font-semibold text-primary" disabled={page === 0} onClick={() => setPage((n) => Math.max(0, n - 1))}>Previous</button>
        <span>Page {page + 1} of {pages}</span>
        <button type="button" className="font-semibold text-primary" disabled={page + 1 >= pages} onClick={() => setPage((n) => n + 1)}>Next</button>
      </div>
    </div>
  );
}
