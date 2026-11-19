import { useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { PricingAdmin } from "@/components/pricing-admin";
import { LogsApiAdmin } from "@/components/logs-api-admin";
import { CATEGORY_LABEL } from "@/lib/catalog";
import { extractCatalog, shapeImport, type ImportKind } from "@/lib/categorize";
import { IMPORT_CARDS } from "@/lib/import-source";
import { batchWindow } from "@/lib/import-batch";
import { resumeCatalogRun, startCatalogRun, useImportRun } from "@/lib/import-run";
import { naira } from "@/lib/money";
import { browseRemoteCatalog, clearNumberCatalog, openCatalogSetup, openImportJobs, testCatalogConnection, testInstaking } from "@/lib/shop-fns";
import { suggestedSetup } from "@/lib/catalog-request";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/import")({ component: ImportPage });

type BrowseCard = {
  stamp: string;
  name: string;
  service: string;
  category: string;
  country: string;
  price: number;
  stock: number;
  blurb: string;
  raw: string;
};

function ImportPage() {
  const providers = useStore((s) => s.providers);
  const adopt = useStore((s) => s.adopt);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [usdRate, setUsdRate] = useState(1650);
  const [markup, setMarkup] = useState(0);
  const [providerId, setProviderId] = useState("");
  const [publish, setPublish] = useState(false);
  const [text, setText] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const run = useImportRun();
  const cleared = useRef("");
  const { phase, total, saved, doneBatches, batches, batchSize, status, jobId, failedSteps, report } = run;
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const [names, setNames] = useState("");
  const [namesDirty, setNamesDirty] = useState(false);
  const [kind, setKind] = useState<ImportKind>("numbers");
  const [rows, setRows] = useState<BrowseCard[]>([]);
  const [picked, setPicked] = useState<Map<string, string>>(() => new Map());
  const [nextCursor, setNextCursor] = useState("");
  const [remoteTotal, setRemoteTotal] = useState<number | null>(null);
  const [browseQ, setBrowseQ] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [browseNote, setBrowseNote] = useState("");
  const [testing, setTesting] = useState(false);
  const [method, setMethod] = useState("");
  const [authKind, setAuthKind] = useState("");
  const [headerName, setHeaderName] = useState("");
  const [contentType, setContentType] = useState("");
  const [queryJson, setQueryJson] = useState("{}");
  const [headersJson, setHeadersJson] = useState("{}");
  const [bodyJson, setBodyJson] = useState("{}");
  const [fieldMap, setFieldMap] = useState("{}");
  const [diag, setDiag] = useState<string>("");
  const [savedJob, setSavedJob] = useState<{ id: string; status: string; total: number; cursor: number; batchSize: number; error: string } | null>(null);
  const busy = phase === "fetch" || phase === "save";
  const requestSetup = () => ({ method, auth: authKind, headerName, contentType, query: queryJson, headers: headersJson, body: bodyJson, fieldMap });
  useEffect(() => {
    if (phase === "done" && run.selective && jobId && cleared.current !== jobId) {
      cleared.current = jobId;
      setPicked(new Map());
    }
  }, [phase, run.selective, jobId]);
  useEffect(() => {
    if (phase !== "idle") return;
    let stop = false;
    openImportJobs()
      .then((rows) => { if (!stop) setSavedJob(rows?.[0] || null); })
      .catch(() => { if (!stop) setSavedJob(null); });
    return () => { stop = true; };
  }, [phase]);
  useEffect(() => {
    if (!providerId) return;
    let stop = false;
    openCatalogSetup({ data: { providerId } })
      .then((res) => {
        if (stop || !res.setup) return;
        setMethod(res.setup.method || "");
        setAuthKind(res.setup.auth || "");
        setHeaderName(res.setup.headerName || "");
        setContentType(res.setup.contentType || "");
        setQueryJson(JSON.stringify(res.setup.query || {}, null, 2));
        setHeadersJson(JSON.stringify(res.setup.headers || {}, null, 2));
        setBodyJson(res.setup.body || "{}");
        setFieldMap(JSON.stringify(res.setup.fieldMap || {}, null, 2));
      })
      .catch(() => undefined);
    return () => { stop = true; };
  }, [providerId]);
  useEffect(() => {
    if (namesDirty) return;
    setNames((settings.wantedServices || []).join("\n"));
  }, [namesDirty, settings.wantedServices]);
  useEffect(() => {
    const existing = providers.find((p) => p.id === providerId);
    if (existing) {
      setCurrency(existing.currency);
      setUsdRate(existing.usdRate || settings.usdNgn || 1343);
      setMarkup(existing.markupPercent || 0);
      return;
    }
    if (/5sim\.net/i.test(apiUrl + name) || /getatext\.com/i.test(apiUrl)) {
      setCurrency("USD");
      if (/5sim\.net/i.test(apiUrl)) setUsdRate(2646);
    }
  }, [providerId, apiUrl, name, providers]);

  const preview = useMemo(() => {
    if (!text.trim()) return null;
    try {
      const parsed = extractCatalog(JSON.parse(text));
      const wanted = names.split(/\n+/).map((item) => item.trim()).filter(Boolean);
      const items = shapeImport(parsed.items, kind, wanted);
      return { ok: true as const, items, skipped: parsed.skipped + (parsed.items.length - items.length) };
    } catch {
      return { ok: false as const, error: "That text is not valid JSON." };
    }
  }, [kind, names, text]);

  const runJob = (payload: unknown | undefined, url: string, forced?: ImportKind, selective = false) => {
    if (busy) return;
    const existing = providerId ? providers.find((p) => p.id === providerId) : undefined;
    const label = (existing?.name || name).trim() || (url ? "New API" : "Pasted API");
    startCatalogRun({
      url,
      payload,
      apiKey,
      providerId,
      name: label,
      baseUrl: url || baseUrl || existing?.baseUrl || "",
      currency,
      usdRate,
      markup,
      publish,
      kind: forced || kind,
      selective,
      setup: requestSetup(),
    });
  };

  const loadBrowse = async (cursor: string, q: string) => {
    if (browsing || busy) return;
    if (!apiUrl.trim()) {
      toast.error("Add the catalogue URL first.");
      return;
    }
    setBrowsing(true);
    setBrowseNote("");
    try {
      const res = await browseRemoteCatalog({ data: { url: apiUrl.trim(), apiKey, providerId, cursor, q, setup: requestSetup() } });
      setRows(res.items);
      setNextCursor(res.nextCursor || "");
      setRemoteTotal(res.total);
      setBrowseNote(res.error || "");
      if (res.error && !res.items.length) toast.error(res.error);
    } catch {
      setBrowseNote("Could not browse that catalogue.");
      toast.error("Could not browse that catalogue.");
    } finally {
      setBrowsing(false);
    }
  };

  const selectPage = () => {
    const next = new Map(picked);
    const clearing = rows.length > 0 && rows.every((row) => next.has(row.stamp));
    if (clearing) {
      for (const row of rows) next.delete(row.stamp);
      setPicked(next);
      return;
    }
    let capped = false;
    for (const row of rows) {
      if (next.has(row.stamp)) continue;
      if (next.size >= 200) {
        capped = true;
        break;
      }
      next.set(row.stamp, row.raw);
    }
    setPicked(next);
    if (capped) toast.error("Select at most 200 products at a time.");
  };

  const priceLabel = (price: number) => {
    if (currency === "USD") {
      const n = Number(price) || 0;
      return `$${n.toLocaleString("en-NG", { maximumFractionDigits: 4 })}`;
    }
    return naira(price);
  };

  const resume = () => {
    if (!jobId || busy) return;
    resumeCatalogRun();
  };

  const probeConnection = async () => {
    if (testing || busy) return;
    if (!apiUrl.trim()) {
      toast.error("Add the catalogue URL first.");
      return;
    }
    setTesting(true);
    setDiag("");
    try {
      const res = await testCatalogConnection({ data: { url: apiUrl.trim(), apiKey, providerId, setup: requestSetup() } });
      const report = res.report;
      if (!report) {
        setDiag(res.error || "The test did not run.");
        toast.error(res.error || "The test did not run.");
        return;
      }
      const lines = [
        report.provider ? `Provider: ${report.provider}` : "",
        `Endpoint: ${report.endpoint}`,
        `Method: ${report.method || "not identified"}`,
        `Authentication: ${report.auth || "none"}`,
        `Status: ${report.status || "—"}`,
        `Discovered: ${report.discovered}`,
        `Skipped: ${report.skipped}`,
        `Failed: ${report.failed}`,
        report.note ? `Attempts: ${report.note}` : "",
        report.shape ? `Shape: ${report.shape}${report.pages ? ", paged" : ""}` : "",
        report.error || (report.confirmed ? "Connection succeeded. Nothing was imported." : ""),
      ].filter(Boolean);
      setDiag(lines.join("\n"));
      if (res.error) toast.error(res.error);
      else toast.success("API connection succeeded. Nothing was imported.");
    } catch {
      setDiag("Could not reach that API.");
      toast.error("Could not reach that API.");
    } finally {
      setTesting(false);
    }
  };

  const probeInstaking = async () => {
    if (testing || busy) return;
    setTesting(true);
    try {
      const res = await testInstaking({ data: { apiKey } });
      if (!res.ok) toast.error(res.error || "Instaking rejected that key.");
      else toast.success(`Instaking balance ${res.balance}${res.currency ? ` ${res.currency}` : ""}`.trim());
    } catch {
      toast.error("Could not reach Instaking.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Import services</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          The import you pick is the category. Words in a product name or description never move it to another marketplace.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {IMPORT_CARDS.map((card) => {
          const provider = providers.find((item) => item.importType && item.name === card.providerName) || providers.find((item) => item.serverId && item.serverId === (card.kind === "numbers" ? "1" : card.kind === "server2" ? "2" : card.kind === "server3" ? "3" : card.kind === "usa" ? "usa" : ""));
          const sync = provider?.lastSync;
          return (
            <article key={card.kind} className={`rounded-card border bg-card p-4 shadow-card ${kind === card.kind ? "border-primary" : "border-line"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-extrabold">{card.title}</h2>
                  <p className="mt-1 text-sm text-muted">{card.blurb}</p>
                </div>
                <Button tone="soft" onClick={() => {
                  setKind(card.kind);
                  setName(card.providerName);
                  setProviderId("");
                  setApiUrl(card.url);
                  setBaseUrl(card.url || "https://");
                  setCurrency(card.currency);
                  if (card.usdRate > 0) setUsdRate(card.usdRate);
                }}>Use</Button>
              </div>
              <p className="mt-2 text-xs text-muted">{card.auth}</p>
              <p className="mt-2 text-xs">
                {sync ? `${sync.imported} read · ${sync.created} new · ${sync.updated} updated · ${sync.skipped} skipped · ${new Date(sync.at).toLocaleString("en-NG")}` : "No import yet."}
              </p>
            </article>
          );
        })}
        <article className="rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="font-extrabold">VPN</h2>
          <p className="mt-1 text-sm text-muted">Coming soon. This card does not import products and checkout will not sell VPN.</p>
        </article>
      </div>
      <PricingAdmin />
      {kind === "random" ? <LogsApiAdmin /> : null}
      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <h2 className="font-extrabold">Number catalogue</h2>
        <p className="mt-1 text-sm text-muted">Number import brings in every service the provider returns for the countries in that catalogue. There is no service-name filter.</p>
        <div className="mt-3">
          <Button
            tone="soft"
            disabled={busy}
            onClick={() => {
              void clearNumberCatalog().then((res) => {
                if (res.error) return toast.error(res.error);
                if (res.state) adopt(res.state);
                toast.success("Imported numbers cleared.");
              });
            }}
          >
            Clear imported numbers
          </Button>
        </div>
      </section>
      {savedJob && phase === "idle" ? (
        <section className="rounded-card border border-line bg-card p-4 shadow-card">
          <p className="text-sm font-semibold">An import is still on the server ({savedJob.status}). {savedJob.cursor.toLocaleString("en-NG")} batches saved of {Math.max(1, Math.ceil(savedJob.total / (savedJob.batchSize || 2000))).toLocaleString("en-NG")}.</p>
          {savedJob.error ? <p className="mt-1 text-xs text-danger">{savedJob.error}</p> : null}
          <Button className="mt-3" onClick={() => resumeCatalogRun({ jobId: savedJob.id, total: savedJob.total, batches: Math.max(1, Math.ceil(savedJob.total / (savedJob.batchSize || 2000))), batch: savedJob.cursor, batchSize: savedJob.batchSize || 2000 })}>Resume this import</Button>
        </section>
      ) : null}
      {phase !== "idle" ? (
        <section className="rounded-card border border-line bg-card p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-extrabold">{phase === "fetch" ? "Downloading" : phase === "save" ? "Saving in batches" : phase === "done" ? "Import finished" : "Import stopped"}</h2>
            <span className={`text-xs font-bold ${phase === "done" ? "text-primary" : phase === "fail" ? "text-danger" : "text-muted"}`}>
              {total > 0 ? `${Math.min(100, Math.round((saved / total) * 100))}%` : phase === "fetch" || phase === "save" ? "Waiting for a count" : phase === "done" ? "Done" : "Stopped"}
            </span>
          </div>
          <div className={`import-meter mt-3 ${total > 0 ? "" : phase === "fetch" || phase === "save" ? "is-wait" : ""}`}>
            <span style={total > 0 ? { width: `${Math.min(100, Math.round((saved / total) * 100))}%` } : undefined} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-xl bg-paper px-2 py-2">
              <p className="text-[11px] font-bold text-muted">Processed</p>
              <p className="text-sm font-extrabold">{phase === "fetch" ? "—" : saved.toLocaleString("en-NG")}</p>
            </div>
            <div className="rounded-xl bg-paper px-2 py-2">
              <p className="text-[11px] font-bold text-muted">Imported</p>
              <p className="text-sm font-extrabold">{report ? (report.created + report.updated).toLocaleString("en-NG") : "—"}</p>
            </div>
            <div className="rounded-xl bg-paper px-2 py-2">
              <p className="text-[11px] font-bold text-muted">Skipped</p>
              <p className="text-sm font-extrabold">{report ? report.skipped.toLocaleString("en-NG") : "—"}</p>
            </div>
            <div className="rounded-xl bg-paper px-2 py-2">
              <p className="text-[11px] font-bold text-muted">Failed</p>
              <p className="text-sm font-extrabold">{phase === "fetch" ? "—" : failedSteps.toLocaleString("en-NG")}</p>
            </div>
          </div>
          <p className="mt-3 text-sm">{status}</p>
          {report ? <p className="mt-1 text-sm text-muted">{report.skipped.toLocaleString("en-NG")} rows skipped as wrappers. {report.created.toLocaleString("en-NG")} new, {report.updated.toLocaleString("en-NG")} updated.</p> : null}
          {busy ? <p className="mt-2 text-xs font-semibold text-muted">You can leave this page. Saving continues in the background.</p> : null}
          {batches > 0 ? (
            <ol className="mt-3 space-y-1 text-sm">
              {Array.from({ length: batches }, (_, i) => {
                const count = batchWindow(total, i, batchSize).count;
                const state = i < doneBatches ? "Saved" : i === doneBatches && phase === "save" ? "Saving" : i === doneBatches && phase === "fail" ? "Failed" : "Waiting";
                return (
                  <li key={i} className={state === "Saving" ? "font-bold" : state === "Saved" ? "text-muted" : "text-muted/60"}>
                    Batch {i + 1} · {count.toLocaleString("en-NG")} services · {state}
                  </li>
                );
              })}
            </ol>
          ) : null}
          {phase === "fail" && jobId && doneBatches < batches ? (
            <Button className="mt-3" tone="soft" onClick={() => resume()}>Continue from batch {doneBatches + 1}</Button>
          ) : null}
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
          {kind === "smm" ? (
            <Button tone="soft" busy={testing} disabled={busy || !apiKey.trim()} onClick={() => void probeInstaking()}>
              {testing ? "Testing Instaking…" : "Test Instaking connection"}
            </Button>
          ) : null}
          <Field label="Import type" hint="This choice is the category. It is not guessed from the product text.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {IMPORT_CARDS.map((card) => (
                <button key={card.kind} type="button" onClick={() => setKind(card.kind)} className={`rounded-xl border px-2 py-2 text-sm font-extrabold ${kind === card.kind ? "border-primary bg-primary text-white" : "border-line bg-paper"}`}>
                  {card.title}
                </button>
              ))}
            </div>
          </Field>
          <p className="text-xs text-muted">VPN is not an import. Electricity and TV are not part of VTU. A selected import only saves the products you tick.</p>
          <Field label="Catalogue URL" hint="Leave the method on Auto unless you already know it. A saved provider reuses the last working setup.">
            <input className={inputClass} value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://provider.example/api/services" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="HTTP method">
              <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="">Auto</option>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </Field>
            <Field label="Authentication">
              <select className={inputClass} value={authKind} onChange={(e) => setAuthKind(e.target.value)}>
                <option value="">Auto</option>
                <option value="bearer">Bearer token</option>
                <option value="token">Authorization: Token</option>
                <option value="api-key">API key header</option>
                <option value="basic">Basic</option>
                <option value="custom">Custom header</option>
                <option value="none">None</option>
              </select>
            </Field>
            <Field label="Header name" hint="Used for API key and custom authentication.">
              <input className={inputClass} value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="X-API-Key" />
            </Field>
            <Field label="Body type">
              <select className={inputClass} value={contentType} onChange={(e) => setContentType(e.target.value)}>
                <option value="">JSON</option>
                <option value="json">JSON</option>
                <option value="form">Form</option>
              </select>
            </Field>
          </div>
          <p className="text-xs text-muted">Known hosts: SMEAPI uses GET and Authorization: Token. GetaText uses GET and an Auth header. 5sim guest prices use GET. Auto tries GET, then POST only after a 405 on a catalogue address. Purchase addresses are never posted.</p>
          <Field label="Query JSON"><textarea className={`${inputClass} font-mono text-xs`} rows={2} value={queryJson} onChange={(e) => setQueryJson(e.target.value)} /></Field>
          <Field label="Headers JSON"><textarea className={`${inputClass} font-mono text-xs`} rows={2} value={headersJson} onChange={(e) => setHeadersJson(e.target.value)} /></Field>
          <Field label="Request body JSON" hint="Sent only with POST, PUT, or PATCH."><textarea className={`${inputClass} font-mono text-xs`} rows={2} value={bodyJson} onChange={(e) => setBodyJson(e.target.value)} /></Field>
          <Field label="Response field map" hint='Example: {"id":"plan_code","name":"plan","price":"amount"}. Leave {} to detect fields.'>
            <textarea className={`${inputClass} font-mono text-xs`} rows={2} value={fieldMap} onChange={(e) => setFieldMap(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button tone="soft" busy={testing} disabled={busy || !apiUrl.trim()} onClick={() => void probeConnection()}>{testing ? "Testing…" : "Test API connection"}</Button>
            <Button tone="soft" busy={busy} disabled={!apiUrl.trim()} onClick={() => void runJob(undefined, apiUrl)}>{busy ? "Importing…" : "Pull and import this API"}</Button>
            <Button tone="soft" busy={busy} onClick={() => void runJob(undefined, "https://5sim.net/v1/guest/prices", "numbers")}>{busy ? "Importing…" : "Import every country from 5sim"}</Button>
          </div>
          {diag ? <pre className="whitespace-pre-wrap rounded-xl bg-paper p-3 text-xs">{diag}</pre> : null}
          {apiUrl.trim() && !method ? <p className="text-xs text-muted">Suggested for this host: {suggestedSetup(apiUrl).method || "GET"}{suggestedSetup(apiUrl).auth ? ` · ${suggestedSetup(apiUrl).auth}` : ""}.</p> : null}
          <Field label="Price currency">
            <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value as "NGN" | "USD")}>
              <option value="NGN">NGN, already in naira</option>
              <option value="USD">USD, convert with this API's rate</option>
            </select>
          </Field>
          <Field label="Naira per 1 USD" hint="Used only to convert a dollar provider cost. The naira profit is added afterwards.">
            <input className={inputClass} inputMode="decimal" value={usdRate} onChange={(e) => setUsdRate(Number(e.target.value))} />
          </Field>
          <p className="text-xs text-muted">Selling prices use Product pricing settings. Percent markups are not applied.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="mt-1" />
            <span>Put new services live immediately. Leave this off if you want to review first. Already-enabled rows stay as they are.</span>
          </label>
          <Field label="Or paste the provider JSON">
            <textarea className={`${inputClass} font-mono text-xs`} rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"sms":{...},"dataplans":{...}}' />
          </Field>
          <Button busy={busy} disabled={!preview || !preview.ok} onClick={() => preview && preview.ok && runJob(JSON.parse(text), "")}>{busy ? "Importing…" : "Import pasted catalogue"}</Button>
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
      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <h2 className="font-extrabold">Browse this catalogue</h2>
        <p className="mt-1 text-sm text-muted">
          Browse does not import and does not remove other products. Tick what you want, then import only those. Prices shown are the API price, before markup. A full pull still replaces that type.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className={inputClass} value={browseQ} onChange={(e) => setBrowseQ(e.target.value)} placeholder='Search, e.g. "WhatsApp" or "Gmail"' />
          <Button tone="soft" busy={browsing} disabled={busy || !apiUrl.trim()} onClick={() => void loadBrowse("", browseQ.trim())}>{browsing ? "Reading…" : "Browse this API"}</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-paper px-3 py-1">Available {remoteTotal == null ? "—" : remoteTotal.toLocaleString("en-NG")}</span>
          <span className="rounded-full bg-paper px-3 py-1">On this page {rows.length.toLocaleString("en-NG")}</span>
          <span className="rounded-full bg-paper px-3 py-1">Selected {picked.size.toLocaleString("en-NG")}</span>
        </div>
        {browseNote ? <p className="mt-3 text-sm text-muted">{browseNote}</p> : null}
        {rows.length || nextCursor || picked.size ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {rows.length ? <Button tone="soft" disabled={busy || browsing} onClick={selectPage}>{rows.every((row) => picked.has(row.stamp)) ? "Clear this page" : "Tick this page"}</Button> : null}
            <Button tone="soft" disabled={busy || browsing || !nextCursor} onClick={() => void loadBrowse(nextCursor, browseQ.trim())}>Next page</Button>
            <Button busy={busy} disabled={browsing || picked.size === 0} onClick={() => {
              const items = [...picked.values()].flatMap((raw) => {
                try {
                  return [JSON.parse(raw) as unknown];
                } catch {
                  return [];
                }
              });
              if (!items.length) {
                toast.error("The ticked products could not be read.");
                return;
              }
              void runJob({ items }, "", kind, true);
            }}>{busy ? "Importing…" : `Import selected (${picked.size})`}</Button>
          </div>
        ) : null}
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.stamp}>
              <label className="flex items-start gap-3 rounded-xl border border-line bg-paper p-3">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={picked.has(row.stamp)} onChange={() => {
                  if (!picked.has(row.stamp) && picked.size >= 200) {
                    toast.error("Select at most 200 products at a time.");
                    return;
                  }
                  setPicked((prev) => {
                    const next = new Map(prev);
                    if (next.has(row.stamp)) next.delete(row.stamp);
                    else next.set(row.stamp, row.raw);
                    return next;
                  });
                }} />
                <span className="min-w-0 flex-1">
                  <span className="block font-extrabold">{row.name}</span>
                  <span className="mt-1 block text-xs text-muted">
                    {[row.service, row.country, row.category ? (CATEGORY_LABEL[row.category] || row.category) : ""].filter(Boolean).join(" · ") || "Unfiled"}
                    {row.stock ? ` · stock ${row.stock.toLocaleString("en-NG")}` : ""}
                  </span>
                  {row.blurb ? <span className="mt-1 block text-sm text-muted">{row.blurb}</span> : null}
                </span>
                <span className="shrink-0 text-sm font-extrabold">{priceLabel(row.price)}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>
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
