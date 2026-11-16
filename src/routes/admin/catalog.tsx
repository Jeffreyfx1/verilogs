import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, inputClass } from "@/components/ui";
import { CATEGORY_LABEL, type Product } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { browseCatalog } from "@/lib/shop-fns";
import { useServers, useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/catalog")({ component: CatalogPage });

const CATS = ["", "numbers", "rent", "data", "airtime", "cable", "electricity", "exam", "boost", "vpn", "giftcard", "betting", "other"];

function CatalogPage() {
  const providers = useStore((s) => s.providers);
  const servers = useServers();
  const setEnabled = useStore((s) => s.setEnabled);
  const editListing = useStore((s) => s.editListing);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [provider, setProvider] = useState("");
  const [only, setOnly] = useState<"all" | "off" | "on">("all");
  const [page, setPage] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [rows, setRows] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [live, setLive] = useState(0);
  const [tick, setTick] = useState(0);
  const [editId, setEditId] = useState("");
  const [draft, setDraft] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stop = false;
    const timer = setTimeout(() => {
      browseCatalog({ data: { q, category: cat, providerId: provider, only, page } })
        .then((res) => {
          if (stop) return;
          setRows(res.rows);
          setTotal(res.total);
          setLive(res.live);
          setLoading(false);
        })
        .catch(() => { if (!stop) setLoading(false); });
    }, 250);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [q, cat, provider, only, page, tick]);

  const pages = Math.max(1, Math.ceil(total / 40));

  const labelFor = (id: string) => {
    const server = servers.find((s) => s.id === id);
    const providerName = providers.find((p) => p.id === id)?.name || "Provider";
    return server ? `${server.label} · ${providerName}` : providerName;
  };

  const toggle = (id: string) => setPicked((cur) => cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
  const apply = (ids: string[], enabled: boolean) => {
    if (!ids.length) return;
    setEnabled(ids, enabled);
    setPicked([]);
    toast.success(enabled ? "Products enabled" : "Products disabled");
    setTimeout(() => setTick((n) => n + 1), 700);
  };
  const openEdit = (product: Product) => {
    setEditId(product.id);
    setDraft(product.description || "");
    setPrice(product.variable ? "" : String(product.price));
    setNote("");
  };
  const saveEdit = async () => {
    if (!editId || saving) return;
    setSaving(true);
    setNote("");
    const error = await editListing(editId, draft, Number(price) || 0);
    setSaving(false);
    if (error) {
      setNote(error);
      return;
    }
    setEditId("");
    setTick((n) => n + 1);
    toast.success("Listing saved");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Catalogue</h1>
        <p className="text-sm text-muted">{total} matching · {live} live. Search and edit one page at a time. A saved price or description stays locked on the next import.</p>
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
        <select className={inputClass} value={only} onChange={(e) => { setOnly(e.target.value as typeof only); setPage(0); }}>
          <option value="all">Live and off</option>
          <option value="off">Switched off</option>
          <option value="on">Live</option>
        </select>
        <Button tone="soft" onClick={() => apply(rows.map((p) => p.id), only !== "on")}>{only === "on" ? "Disable this page" : "Enable this page"}</Button>
      </div>
      {picked.length ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => apply(picked, true)}>Enable {picked.length}</Button>
          <Button tone="soft" onClick={() => apply(picked, false)}>Disable {picked.length}</Button>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-card border border-line bg-card">
        <div className="scroll-tall">
          {loading && !rows.length ? <p className="px-3 py-6 text-sm text-muted">Loading catalogue…</p> : null}
          {!loading && !rows.length ? <p className="px-3 py-6 text-sm text-muted">No products match this filter.</p> : null}
          {rows.map((p) => (
            <div key={p.id} className="border-b border-line px-3 py-3 text-sm">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} className="mt-1" aria-label={`Select ${p.name}`} />
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{p.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">{CATEGORY_LABEL[p.category]} · {labelFor(p.providerId)} · {[p.country, p.network, p.service].filter(Boolean).join(" · ")}</span>
                  {p.description ? <span className="mt-1 block line-clamp-2 text-xs text-muted">{p.description.replace(/\s+/g, " ").trim()}</span> : null}
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold">{p.variable ? "Variable" : naira(p.price)}</span>
                  <button type="button" className={`text-xs font-semibold ${p.enabled ? "text-ok" : "text-muted"}`} onClick={() => setEnabled([p.id], !p.enabled)}>{p.enabled ? "Live" : "Off"}</button>
                  <button type="button" className="mt-1 block text-xs font-semibold text-primary" onClick={() => editId === p.id ? setEditId("") : openEdit(p)}>{editId === p.id ? "Close" : "Edit"}</button>
                </span>
              </div>
              {editId === p.id ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem]">
                  <textarea className={inputClass} rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Full description. Line breaks are kept." />
                  <div className="flex flex-col gap-2">
                    <input className={inputClass} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))} placeholder="Price" aria-label="Selling price" />
                    <Button busy={saving} onClick={() => void saveEdit()}>{saving ? "Saving" : "Save"}</Button>
                  </div>
                  {note ? <p className="text-xs text-danger sm:col-span-2">{note}</p> : <p className="text-xs text-muted sm:col-span-2">Saving locks this description and price so a later import will not overwrite them.</p>}
                </div>
              ) : null}
            </div>
          ))}
          {!rows.length ? <p className="p-6 text-sm text-muted">No rows match.</p> : null}
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
