import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { CATEGORY_LABEL, type SyncReport } from "@/lib/catalog";
import { extractCatalog, shapeImport, type ImportKind } from "@/lib/categorize";
import { batchWindow } from "@/lib/import-batch";
import { beginCatalogImport, clearNumberCatalog, stepCatalogImport } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/import")({ component: ImportPage });

function ImportPage() {
  const providers = useStore((s) => s.providers);
  const adopt = useStore((s) => s.adopt);
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
  const [phase, setPhase] = useState<"idle" | "fetch" | "save" | "done" | "fail">("idle");
  const [total, setTotal] = useState(0);
  const [saved, setSaved] = useState(0);
  const [doneBatches, setDoneBatches] = useState(0);
  const [batches, setBatches] = useState(0);
  const [batchSize, setBatchSize] = useState(2000);
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const [jobId, setJobId] = useState("");
  const [names, setNames] = useState("");
  const [namesDirty, setNamesDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState<ImportKind>("numbers");
  const busy = phase === "fetch" || phase === "save";
  useEffect(() => {
    if (namesDirty) return;
    setNames((settings.wantedServices || []).join("\n"));
  }, [namesDirty, settings.wantedServices]);
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
      const wanted = names.split(/\n+/).map((item) => item.trim()).filter(Boolean);
      const items = shapeImport(parsed.items, kind, wanted);
      return { ok: true as const, items, skipped: parsed.skipped + (parsed.items.length - items.length) };
    } catch {
      return { ok: false as const, error: "That text is not valid JSON." };
    }
  }, [kind, names, text]);

  const runJob = async (payload: unknown | undefined, url: string, forced?: ImportKind) => {
    if (busy) return;
    const existing = providerId ? providers.find((p) => p.id === providerId) : undefined;
    const label = (existing?.name || name).trim() || (url ? "New API" : "Pasted API");
    setPhase(url ? "fetch" : "save");
    setStatus(url ? "Downloading the catalogue." : "Splitting the catalogue into batches of 2,000.");
    setReport(null);
    setSaved(0);
    setDoneBatches(0);
    setBatches(0);
    setTotal(0);
    setJobId("");
    try {
      const started = await beginCatalogImport({
        data: {
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
        },
      });
      if (started.error || !started.jobId) {
        setPhase("fail");
        setStatus(started.error || "Import failed");
        toast.error(started.error || "Import failed");
        return;
      }
      setJobId(started.jobId);
      setTotal(started.total);
      setBatches(started.batches);
      setBatchSize(started.batchSize);
      setPhase("save");
      setStatus(`Saving batch 1 of ${started.batches}.`);
      let guard = 0;
      let latest = started;
      while (!latest.done && guard < started.batches + 2) {
        guard += 1;
        const step = await stepCatalogImport({ data: { jobId: started.jobId } });
        if (step.error) {
          setPhase("fail");
          setSaved(step.saved);
          setDoneBatches(step.batch);
          setStatus(step.error);
          toast.error(step.error);
          return;
        }
        latest = step;
        setSaved(step.saved);
        setDoneBatches(step.batch);
        if (step.state) adopt(step.state);
        if (!step.done) setStatus(`Saving batch ${step.batch + 1} of ${step.batches}.`);
      }
      if (!latest.done || !latest.report) {
        setPhase("fail");
        setStatus("The import stopped before the last batch.");
        return;
      }
      setReport(latest.report);
      setPhase("done");
      const message = `${latest.report.imported.toLocaleString("en-NG")} services filed under ${latest.report.serverLabel || label}`;
      setStatus(message);
      toast.success(message);
    } catch {
      setPhase("fail");
      setStatus("Could not keep saving. The batches already saved are still in the catalogue.");
      toast.error("Import stopped.");
    }
  };

  const resume = async () => {
    if (!jobId || busy) return;
    setPhase("save");
    setStatus(`Saving batch ${doneBatches + 1} of ${batches}.`);
    try {
      let latest = { done: false, report: null as SyncReport | null, batch: doneBatches, batches, saved };
      let guard = 0;
      while (!latest.done && guard < batches + 2) {
        guard += 1;
        const step = await stepCatalogImport({ data: { jobId } });
        if (step.error) {
          setPhase("fail");
          setSaved(step.saved);
          setDoneBatches(step.batch);
          setStatus(step.error);
          toast.error(step.error);
          return;
        }
        latest = step;
        setSaved(step.saved);
        setDoneBatches(step.batch);
        if (step.state) adopt(step.state);
        if (!step.done) setStatus(`Saving batch ${step.batch + 1} of ${step.batches}.`);
      }
      if (!latest.done || !latest.report) {
        setPhase("fail");
        setStatus("The import stopped before the last batch.");
        return;
      }
      setReport(latest.report);
      setPhase("done");
      setStatus(`${latest.report.imported.toLocaleString("en-NG")} services filed.`);
      toast.success("Import finished.");
    } catch {
      setPhase("fail");
      setStatus("Could not continue. Try again. Saved batches stay in the catalogue.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Import services</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Only the service names below are imported, for every country that API actually sells. WhatsApp, Telegram, Facebook, Instagram, Amazon, Google, YouTube, TikTok and ChatGPT are already on the list. Add a name, save it, then pull again. A pull replaces the old number catalogue.
        </p>
      </div>
      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <h2 className="font-extrabold">Services to import</h2>
        <p className="mt-1 text-sm text-muted">One name per line. The match is the API's service name, so WhatsApp also catches whatsapp.</p>
        <textarea className={`${inputClass} mt-3 font-mono text-sm`} rows={8} value={names} onChange={(e) => { setNamesDirty(true); setNames(e.target.value); }} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            tone="soft"
            disabled={busy}
            onClick={() => {
              const wantedServices = names.split(/\n+/).map((name) => name.trim()).filter(Boolean).slice(0, 200);
              if (!wantedServices.length) return toast.error("Keep at least one service name.");
              void saveSettings({ wantedServices }).then((err) => {
                if (err) toast.error(err);
                else toast.success("Service list saved.");
              });
            }}
          >
            Save service list
          </Button>
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
      {phase !== "idle" ? (
        <section className="rounded-card border border-line bg-card p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-extrabold">{phase === "fetch" ? "Downloading" : phase === "save" ? "Saving in batches" : phase === "done" ? "Import finished" : "Import stopped"}</h2>
            <span className={`text-xs font-bold ${phase === "done" ? "text-primary" : phase === "fail" ? "text-danger" : "text-muted"}`}>
              {total ? `${saved.toLocaleString("en-NG")} / ${total.toLocaleString("en-NG")}` : phase === "fetch" ? "Working" : phase === "done" ? "Done" : "Failed"}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper">
            <div
              className={`h-full rounded-full transition-all duration-700 ${phase === "fail" ? "bg-danger" : "bg-primary"} ${phase === "save" || phase === "fetch" ? "animate-pulse" : ""}`}
              style={{ width: `${total ? Math.min(100, Math.round((saved / total) * 100)) : phase === "fetch" ? 8 : phase === "done" ? 100 : 0}%` }}
            />
          </div>
          <p className="mt-3 text-sm">{status}</p>
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
            <Button className="mt-3" tone="soft" onClick={() => void resume()}>Continue from batch {doneBatches + 1}</Button>
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
          <Field label="Import type" hint="Pick one type. Importing it again only replaces that type on this server. Numbers, VTU, VPN and SMM stay side by side.">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {([
                ["numbers", "Numbers"],
                ["vtu", "VTU"],
                ["vpn", "VPN"],
                ["smm", "SMM"],
                ["random", "Random"],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" onClick={() => setKind(id)} className={`rounded-xl border px-2 py-2 text-sm font-extrabold ${kind === id ? "border-primary bg-primary text-white" : "border-line bg-paper"}`}>
                  {label}
                </button>
              ))}
            </div>
          </Field>
          <p className="text-xs text-muted">
            Numbers uses the saved names. VTU tries GET and POST. An airtime purchase URL has no catalogue, so VTU reads the data plans and adds MTN, Airtel, Glo and 9mobile as top-up amounts. Random keeps every service from a real product list, under the category that site already uses.
          </p>
          <Field label="Catalogue URL" hint="The saved name list only filters a Numbers import.">
            <input className={inputClass} value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://provider.example/api/services" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button tone="soft" disabled={busy || !apiUrl.trim()} onClick={() => void runJob(undefined, apiUrl)}>{busy ? "Importing…" : "Pull and import this API"}</Button>
            <Button tone="soft" disabled={busy} onClick={() => void runJob(undefined, "https://5sim.net/v1/guest/prices", "numbers")}>{busy ? "Importing…" : "Import saved services for every country"}</Button>
          </div>
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
          <p className="text-xs text-muted">Example: $0.10 sells at ₦{Math.ceil((0.1 * (usdRate || 0) * (markup || 1)) / 5) * 5}. A Numbers import does not delete VTU, VPN or SMM on the same server.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="mt-1" />
            <span>Put new services live immediately. Leave this off if you want to review first. Already-enabled rows stay as they are.</span>
          </label>
          <Field label="Or paste the provider JSON">
            <textarea className={`${inputClass} font-mono text-xs`} rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder='{"sms":{...},"dataplans":{...}}' />
          </Field>
          <Button disabled={busy || !preview || !preview.ok} onClick={() => preview && preview.ok && runJob(JSON.parse(text), "")}>{busy ? "Importing…" : "Import pasted catalogue"}</Button>
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
