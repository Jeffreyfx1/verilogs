import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { ACCSZONE_MAP, ACCSZONE_PAGE } from "@/lib/logs-map";
import { naira } from "@/lib/money";
import { logProviders, previewLogProvider, removeLogProvider, runLogImport, saveLogProvider, testLogProvider } from "@/lib/shop-fns";

type ProviderRow = {
  id: string;
  name: string;
  baseUrl: string;
  hasKey: boolean;
  productsPath: string;
  method: string;
  authMethod: string;
  apiKeyHeader: string;
  extraHeaders: string;
  queryJson: string;
  bodyJson: string;
  paginationJson: string;
  fieldMap: string;
  enabled: boolean;
  currency: "NGN" | "USD";
  usdRate: number;
  lastStatus: string;
  lastError: string;
  lastImported: number;
  lastPage: number;
};

const blank = {
  id: "",
  name: "",
  baseUrl: "https://accszone.com/api/v1",
  apiKey: "",
  productsPath: "/listings",
  method: "GET",
  authMethod: "header",
  apiKeyHeader: "X-API-Key",
  extraHeaders: "{}",
  queryJson: JSON.stringify({ include: "description" }),
  bodyJson: "{}",
  paginationJson: JSON.stringify(ACCSZONE_PAGE),
  fieldMap: JSON.stringify(ACCSZONE_MAP, null, 2),
  enabled: true,
  currency: "USD" as "NGN" | "USD",
  usdRate: 0,
};

export function LogsApiAdmin() {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [form, setForm] = useState(blank);
  const [preview, setPreview] = useState<Array<{ name: string; description: string; imageUrl: string; category: string; subcategory: string; price: number }>>([]);
  const [busy, setBusy] = useState("");

  const load = () => {
    logProviders().then((list) => setRows(list as ProviderRow[])).catch(() => toast.error("Could not load log providers."));
  };
  useEffect(() => { load(); }, []);

  const set = (key: keyof typeof form, value: string | boolean | number) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    setBusy("save");
    try {
      const res = await saveLogProvider({ data: form });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Logs provider saved");
        setForm(blank);
        load();
      }
    } catch {
      toast.error("Could not save that provider.");
    } finally {
      setBusy("");
    }
  };

  const act = async (id: string, kind: "test" | "preview" | "import" | "resume" | "delete") => {
    setBusy(id + kind);
    try {
      if (kind === "delete") {
        const res = await removeLogProvider({ data: { id } });
        if (res.error) toast.error(res.error);
        else toast.success(`Provider removed. ${res.removed} active products cleared. Orders were kept.`);
      } else if (kind === "test") {
        const res = await testLogProvider({ data: { id } });
        if (!res.ok) toast.error(res.error || "Connection failed");
        else toast.success(`Connection ok. ${res.count} products on the first page. Nothing was imported.`);
      } else if (kind === "preview") {
        const res = await previewLogProvider({ data: { id } });
        if (res.error) toast.error(res.error);
        else {
          setPreview(res.rows);
          toast.success(res.rows.length ? "Preview ready" : "The provider returned no products.");
        }
      } else {
        const res = await runLogImport({ data: { id, resume: kind === "resume" } });
        if (res.error) toast.error(res.error);
        else toast.success(`${res.imported} products are in Buy Logs.`);
      }
      load();
    } catch {
      toast.error("That request did not finish.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="rounded-card border border-line bg-card p-4 shadow-card">
      <h2 className="font-extrabold">Logs API providers</h2>
      <p className="mt-1 text-sm text-muted">Every product imported here is filed in Buy Logs only. Add more than one provider. Keys stay on the server.</p>
      <div className="mt-3 grid gap-3">
        {rows.map((row) => (
          <article key={row.id} className="rounded-xl border border-line p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-bold">{row.name} {row.enabled ? "" : "· disabled"}</p>
                <p className="text-xs text-muted">{row.method} {row.baseUrl}{row.productsPath} · {row.hasKey ? "key saved" : "no key"} · {row.lastImported} imported</p>
                {row.lastError ? <p className="text-xs text-danger">{row.lastError}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button tone="soft" busy={busy === row.id + "test"} onClick={() => void act(row.id, "test")}>Test connection</Button>
                <Button tone="soft" busy={busy === row.id + "preview"} onClick={() => void act(row.id, "preview")}>Preview</Button>
                <Button busy={busy === row.id + "import"} onClick={() => void act(row.id, "import")}>Import</Button>
                <Button tone="soft" busy={busy === row.id + "resume"} onClick={() => void act(row.id, "resume")}>Resume</Button>
                <Button tone="soft" onClick={() => setForm({ ...blank, ...row, apiKey: "", fieldMap: row.fieldMap, paginationJson: row.paginationJson })}>Edit</Button>
                <Button tone="soft" onClick={() => void saveLogProvider({ data: { ...row, apiKey: "", enabled: !row.enabled } }).then(() => load())}>{row.enabled ? "Disable" : "Enable"}</Button>
                <Button tone="soft" busy={busy === row.id + "delete"} onClick={() => void act(row.id, "delete")}>Delete</Button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {preview.length ? (
        <div className="mt-4 grid gap-2">
          <h3 className="font-bold">Preview · not imported yet</h3>
          {preview.map((row) => (
            <article key={row.name + row.price} className="flex gap-3 rounded-xl border border-line p-3">
              {row.imageUrl ? <img src={row.imageUrl} alt="" className="size-12 rounded-lg object-contain" /> : <span className="flex size-12 items-center justify-center rounded-lg bg-paper text-xs">No logo</span>}
              <div>
                <p className="font-bold">{row.name}</p>
                <p className="text-xs text-muted">{[row.category, row.subcategory].filter(Boolean).join(" · ") || "No category"} · provider {row.price}</p>
                <p className="text-sm">{row.description || "No description supplied."}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Field label="Provider name"><input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="AccsZone" /></Field>
        <Field label="API base URL"><input className={inputClass} value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} /></Field>
        <Field label="API key" hint="Leave blank when editing to keep the saved key."><input className={inputClass} value={form.apiKey} onChange={(e) => set("apiKey", e.target.value)} /></Field>
        <Field label="Products endpoint"><input className={inputClass} value={form.productsPath} onChange={(e) => set("productsPath", e.target.value)} /></Field>
        <Field label="HTTP method">
          <select className={inputClass} value={form.method} onChange={(e) => set("method", e.target.value)}><option>GET</option><option>POST</option></select>
        </Field>
        <Field label="Authentication">
          <select className={inputClass} value={form.authMethod} onChange={(e) => set("authMethod", e.target.value)}>
            <option value="header">Header</option>
            <option value="bearer">Bearer</option>
            <option value="query">Query</option>
            <option value="none">None</option>
          </select>
        </Field>
        <Field label="API key header or query name"><input className={inputClass} value={form.apiKeyHeader} onChange={(e) => set("apiKeyHeader", e.target.value)} /></Field>
        <Field label="Currency">
          <select className={inputClass} value={form.currency} onChange={(e) => set("currency", e.target.value)}><option value="USD">USD</option><option value="NGN">NGN</option></select>
        </Field>
        <Field label="Naira per 1 USD"><input className={inputClass} inputMode="decimal" value={form.usdRate} onChange={(e) => set("usdRate", Number(e.target.value))} /></Field>
        <Field label="Extra headers JSON"><textarea className={inputClass} rows={3} value={form.extraHeaders} onChange={(e) => set("extraHeaders", e.target.value)} /></Field>
        <Field label="Query JSON"><textarea className={inputClass} rows={3} value={form.queryJson} onChange={(e) => set("queryJson", e.target.value)} /></Field>
        <Field label="Body JSON"><textarea className={inputClass} rows={3} value={form.bodyJson} onChange={(e) => set("bodyJson", e.target.value)} /></Field>
        <Field label="Pagination JSON"><textarea className={inputClass} rows={4} value={form.paginationJson} onChange={(e) => set("paginationJson", e.target.value)} /></Field>
        <Field label="Field map JSON" hint="Paths such as category.title. Password, cookie and token fields are ignored.">
          <textarea className={`${inputClass} md:col-span-2`} rows={8} value={form.fieldMap} onChange={(e) => set("fieldMap", e.target.value)} />
        </Field>
      </div>
      <p className="mt-2 text-xs text-muted">Selling price uses the Logs profit, currently added once per order. A ₦5,000 provider cost with ₦1,500 profit is {naira(6500)} after conversion.</p>
      <Button className="mt-3" busy={busy === "save"} onClick={() => void save()}>{form.id ? "Update provider" : "Add provider"}</Button>
    </section>
  );
}
