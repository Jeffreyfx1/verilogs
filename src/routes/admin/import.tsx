import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { CATEGORY_LABEL, type SyncReport } from "@/lib/catalog";
import { extractCatalog } from "@/lib/categorize";
import { importUrl } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/import")({ component: ImportPage });

const PULL_STEPS = [
  "Opening the API",
  "Downloading the catalogue",
  "Reading every operator and success rate",
  "Applying this API's naira rate and markup",
  "Saving the catalogue",
];

function ImportPage() {
  const providers = useStore((s) => s.providers);
  const importPayload = useStore((s) => s.importPayload);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [usdRate, setUsdRate] = useState(1650);
  const [markup, setMarkup] = useState(1);
  const [providerId, setProviderId] = useState("");
  const [publish, setPublish] = useState(false);
  const [text, setText] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [report, setReport] = useState<SyncReport | null>(null);
  const [phase, setPhase] = useState<"idle" | "run" | "done" | "fail">("idle");
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState("");
  const busy = phase === "run";
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(() => setStep((n) => Math.min(n + 1, PULL_STEPS.length - 1)), 8000);
    return () => window.clearInterval(id);
  }, [busy]);
  useEffect(() => {
    const existing = providers.find((p) => p.id === providerId);
    if (existing) {
      setCurrency(existing.currency);
      setUsdRate(existing.usdRate || 2646);
      setMarkup(existing.markup || 1.6);
      return;
    }
    if (/5sim/i.test(apiUrl + name)) {
      setCurrency("USD");
      setUsdRate(2646);
      setMarkup(1.6);
    }
  }, [providerId, apiUrl, name, providers]);

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
    if (busy) return;
    const existing = providerId ? providers.find((p) => p.id === providerId) : undefined;
    const label = (existing?.name || name).trim() || fallbackName;
    setPhase("run");
    setStep(0);
    setStatus("");
    try {
      const result = await importPayload({
        providerId: existing?.id,
        name: label,
        baseUrl: url || apiUrl || baseUrl || existing?.baseUrl || "https://provider.example/api",
        currency: existing?.currency || currency,
        usdRate,
        markup,
        payload,
        hasKey: true,
        publish,
        apiKey,
      });
      setReport(result);
      setPhase("done");
      setStatus(`${result.imported} services filed under ${result.serverLabel || label}`);
      toast.success(`${result.imported} services filed under ${result.serverLabel || label}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Import failed";
      setPhase("fail");
      setStatus(message);
      toast.error(message);
    }
  };

  const adopt = useStore((s) => s.adopt);
  const pull = async () => {
    if (busy) return;
    const existing = providerId ? providers.find((p) => p.id === providerId) : undefined;
    const label = (existing?.name || name).trim() || "New API";
    setPhase("run");
    setStep(0);
    setStatus("");
    setReport(null);
    try {
      const res = await importUrl({
        data: {
          url: apiUrl,
          apiKey,
          providerId,
          name: label,
          baseUrl: apiUrl || baseUrl,
          currency: currency,
          usdRate,
          markup,
          publish,
        },
      });
      if (res.error || !res.report) {
        const message = res.error || "Import failed";
        setPhase("fail");
        setStatus(message);
        return toast.error(message);
      }
      adopt(res.state);
      setReport(res.report);
      const message = `${res.report.imported} services filed under ${res.report.serverLabel || label}`;
      setPhase("done");
      setStatus(message);
      toast.success(message);
    } catch {
      setPhase("fail");
      setStatus("Could not pull that API. Check the URL and try again.");
      toast.error("Could not pull that API.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Import services</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Paste a provider catalogue or pull a live URL. A 5sim pull keeps every in-stock operator, with its price and success rate. Use https://5sim.net/v1/guest/prices with currency USD. Pull again after changing the rate or markup. For rentals use https://5sim.net/v1/guest/prices?category=hosting. New rows stay off until you enable them.
        </p>
      </div>
      {phase !== "idle" ? (
        <section className="rounded-card border border-line bg-card p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-extrabold">{phase === "run" ? "Importing" : phase === "done" ? "Import finished" : "Import stopped"}</h2>
            <span className={`text-xs font-bold ${phase === "done" ? "text-primary" : phase === "fail" ? "text-danger" : "text-muted"}`}>{phase === "run" ? "Working" : phase === "done" ? "Done" : "Failed"}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
            <div
              className={`h-full rounded-full transition-all duration-700 ${phase === "fail" ? "bg-danger" : "bg-primary"} ${phase === "run" ? "animate-pulse" : ""}`}
              style={{ width: phase === "run" ? `${Math.round(((step + 1) / (PULL_STEPS.length + 1)) * 100)}%` : "100%" }}
            />
          </div>
          {phase === "run" ? (
            <ol className="mt-3 space-y-1 text-sm">
              {PULL_STEPS.map((label, i) => (
                <li key={label} className={i < step ? "text-muted" : i === step ? "font-bold" : "text-muted/60"}>
                  {i < step ? "Done · " : i === step ? "Now · " : ""}{label}
                </li>
              ))}
              <li className="pt-1 text-xs text-muted">A 5sim catalogue takes about a minute. Stay on this page.</li>
            </ol>
          ) : (
            <p className="mt-3 text-sm">{status}</p>
          )}
        </section>
      ) : null}
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
          <Button tone="soft" disabled={busy || !apiUrl.trim()} onClick={() => void pull()}>{busy ? "Importing…" : "Pull and import this API"}</Button>
          <Field label="Price currency">
            <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value as "NGN" | "USD")}>
              <option value="NGN">NGN, already in naira</option>
              <option value="USD">USD, convert with this API's rate</option>
            </select>
          </Field>
          <Field label="Naira per 1 USD" hint="5sim uses 2,646. Each API keeps its own rate.">
            <input className={inputClass} inputMode="decimal" value={usdRate} onChange={(e) => setUsdRate(Number(e.target.value))} />
          </Field>
          <Field label="Markup" hint="5sim uses 1.6. A $0.10 number becomes 0.10 × rate × markup.">
            <input className={inputClass} inputMode="decimal" value={markup} onChange={(e) => setMarkup(Number(e.target.value))} />
          </Field>
          <p className="text-xs text-muted">Example: $0.10 sells at ₦{Math.ceil((0.1 * (usdRate || 0) * (markup || 1)) / 5) * 5}. Prices update on the next import.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="mt-1" />
            <span>Put new services live immediately. Leave this off if you want to review first. Already-enabled rows stay as they are.</span>
          </label>
          <Field label="Or paste the provider JSON">
            <textarea className={`${inputClass} font-mono text-xs`} rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"sms":{...},"dataplans":{...}}' />
          </Field>
          <Button disabled={busy || !preview || !preview.ok} onClick={() => preview && preview.ok && run(JSON.parse(text), "Pasted API")}>{busy ? "Importing…" : "Import pasted catalogue"}</Button>
        </section>
        <section className="rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="font-bold">Before it lands</h2>
          {!preview ? <p className="mt-3 text-sm text-muted">Paste JSON to see how it will be filed before you import it.</p> : null}
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
