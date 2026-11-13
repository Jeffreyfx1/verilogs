import { useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { CATEGORY_LABEL, mixedPayload, smsPayload, vtuPayload, type SyncReport } from "@/lib/catalog";
import { extractCatalog } from "@/lib/categorize";
import { fetchCatalogue } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/import")({ component: ImportPage });

function ImportPage() {
  const providers = useStore((s) => s.providers);
  const importPayload = useStore((s) => s.importPayload);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [providerId, setProviderId] = useState("");
  const [publish, setPublish] = useState(false);
  const [text, setText] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [report, setReport] = useState<SyncReport | null>(null);

  const preview = useMemo(() => {
    if (!text.trim()) return null;
    try {
      const parsed = extractCatalog(JSON.parse(text));
      return { ok: true as const, ...parsed };
    } catch {
      return { ok: false as const, error: "That text is not valid JSON." };
    }
  }, [text]);

  const run = async (payload: unknown, fallbackName: string, url?: string) => {
    const existing = providerId ? providers.find((p) => p.id === providerId) : undefined;
    const label = (existing?.name || name).trim() || fallbackName;
    try {
      const result = await importPayload({
        providerId: existing?.id,
        name: label,
        baseUrl: url || apiUrl || baseUrl || existing?.baseUrl || "https://provider.example/api",
        currency: existing?.currency || currency,
        payload,
        hasKey: true,
        publish,
        apiKey,
      });
      setReport(result);
      toast.success(`${result.imported} services filed under ${result.serverLabel || label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  const pull = async () => {
    const res = await fetchCatalogue({ data: { url: apiUrl, apiKey, providerId } });
    if (!res.ok) return toast.error(res.error);
    const parsed = extractCatalog(res.payload);
    toast.success(`${parsed.items.length} services understood across ${new Set(parsed.items.map((i) => i.category)).size} categories`);
    await run(res.payload, name || "New API", apiUrl);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Import services</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Paste a provider catalogue, pull a live URL, or load a sample. A catalogue with numbers, data, airtime and bills is filed into those shelves. New rows stay off until you enable them. A second SMS API becomes the next server. Data plans keep their SIM.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
          <Field label="Add to">
            <select className={inputClass} value={providerId} onChange={(e) => setProviderId(e.target.value)}>
              <option value="">New provider</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          {!providerId ? (
            <>
              <Field label="Provider name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Harbour SMS" /></Field>
              <Field label="Base URL"><input className={inputClass} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></Field>
            </>
          ) : null}
          <Field label="API key" hint="Stored on the server for this provider. It is not shown again.">
            <input className={inputClass} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Optional until you pull a live URL" />
          </Field>
          <Field label="Catalogue URL">
            <input className={inputClass} value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://provider.example/api/services" />
          </Field>
          <Button tone="soft" onClick={() => void pull()}>Pull and import this API</Button>
          <Field label="Price currency">
            <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value as "NGN" | "USD")}>
              <option value="NGN">NGN</option>
              <option value="USD">USD, converted with your naira rate</option>
            </select>
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="mt-1" />
            <span>Put new services live immediately. Leave this off if you want to review first. Already-enabled rows stay as they are.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button tone="soft" onClick={() => run(smsPayload(1), "Sample SMS")}>Import SMS catalogue</Button>
            <Button tone="soft" onClick={() => run(vtuPayload(), "Sample VTU", "https://vtu.provider.example/api")}>Import VTU catalogue</Button>
            <Button tone="soft" onClick={() => run(mixedPayload(), "Mixed API", "https://mixed.provider.example/api")}>Import mixed API</Button>
          </div>
          <Field label="Or paste the provider JSON">
            <textarea className={`${inputClass} font-mono text-xs`} rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"sms":{...},"dataplans":{...}}' />
          </Field>
          <Button disabled={!preview || !preview.ok} onClick={() => preview && preview.ok && run(JSON.parse(text), "Pasted API")}>Import pasted catalogue</Button>
        </section>
        <section className="rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="font-bold">Before it lands</h2>
          {!preview ? <p className="mt-3 text-sm text-muted">Paste JSON to see how it will be filed, or use a sample button. Samples import straight away.</p> : null}
          {preview && !preview.ok ? <p className="mt-3 text-sm text-danger">{preview.error}</p> : null}
          {preview && preview.ok ? <Report items={preview.items.length} by={countCats(preview.items)} networks={countNets(preview.items)} note={`${preview.items.length} services understood. ${preview.skipped} wrapper rows ignored.`} /> : null}
          {report ? (
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="font-bold">Last import {report.serverLabel ? `· ${report.serverLabel}` : ""}</h3>
              <p className="mt-1 text-sm text-muted">{report.imported} read · {report.created} new · {report.updated} updated · {report.skipped} skipped wrappers.</p>
              <Report items={report.imported} by={report.byCategory} networks={report.byNetwork} />
              <Link to="/admin/catalog" className="mt-3 inline-block text-sm font-semibold text-primary">Review and enable</Link>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function countCats(items: { category: string }[]) {
  return items.reduce<Record<string, number>>((acc, i) => { acc[i.category] = (acc[i.category] || 0) + 1; return acc; }, {});
}
function countNets(items: { network: string }[]) {
  return items.reduce<Record<string, number>>((acc, i) => { if (i.network) acc[i.network] = (acc[i.network] || 0) + 1; return acc; }, {});
}

function Report({ items, by, networks, note }: { items: number; by: Record<string, number>; networks: Record<string, number>; note?: string }) {
  return (
    <div className="mt-3 space-y-2 text-sm">
      {note ? <p className="text-muted">{note}</p> : <p className="text-muted">{items} services</p>}
      <div className="flex flex-wrap gap-2">
        {Object.entries(by).map(([k, n]) => <span key={k} className="rounded-full bg-paper px-3 py-1">{CATEGORY_LABEL[k] || k}: {n}</span>)}
      </div>
      {Object.keys(networks).length ? (
        <p className="text-xs text-muted">SIM networks: {Object.entries(networks).map(([n, c]) => `${n} ${c}`).join(" · ")}</p>
      ) : null}
    </div>
  );
}
