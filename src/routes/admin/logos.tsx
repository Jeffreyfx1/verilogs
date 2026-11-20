import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { importCategoryLogos, logoManager, refreshCategoryLogos, saveManualCategoryLogo, scanCategoryLogos } from "@/lib/shop-fns";
import { selectableLogoCategories } from "@/lib/logo-discover";

export const Route = createFileRoute("/admin/logos")({ component: LogoManager });

type Row = {
  category: string;
  services: number;
  customImages: number;
  discoveredName: string;
  imageUrl: string;
  page: string;
  confidence: number;
  status: "high" | "ambiguous" | "none";
  note: string;
  stored: { imageUrl: string; custom: boolean; verified: boolean } | null;
};

function LogoManager() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState({ discovered: 0, listingImages: 0, moreLinks: 0, missing: 0, ambiguous: 0, high: 0, covered: 0, note: "", fetchedAt: "" });
  const [errors, setErrors] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [busy, setBusy] = useState("");
  const [manualCategory, setManualCategory] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [replace, setReplace] = useState(false);

  const load = () => {
    logoManager().then((desk) => {
      setRows(desk.rows as Row[]);
      setSummary({ discovered: desk.discovered, listingImages: desk.listingImages, moreLinks: desk.moreLinks, missing: desk.missing, ambiguous: desk.ambiguous, high: desk.high, covered: desk.covered, note: desk.note, fetchedAt: desk.fetchedAt });
      setErrors(desk.errors || []);
    }).catch(() => toast.error("Could not load category logos."));
  };
  useEffect(() => { load(); }, []);

  const scan = async () => {
    setBusy("scan");
    try {
      const res = await scanCategoryLogos();
      if (res.error) toast.error(res.error);
      else toast.success(`Found ${res.report.categories.length} category logos. Nothing was imported yet.`);
      load();
    } catch {
      toast.error("The AccsZone scan did not finish.");
    } finally {
      setBusy("");
    }
  };

  const runImport = async (allHigh: boolean) => {
    setBusy(allHigh ? "all" : "some");
    try {
      const res = await importCategoryLogos({ data: { categories: picked, allHigh, replace } });
      if (res.error) toast.error(res.error);
      else toast.success(`Imported ${res.imported} category logos. ${res.covered} services can show them. ${res.skipped} skipped.`);
      if (res.failed?.length) toast.error(res.failed.slice(0, 2).join(" "));
      setPicked([]);
      load();
    } catch {
      toast.error("Import did not finish.");
    } finally {
      setBusy("");
    }
  };

  const shown = onlyMissing ? rows.filter((row) => !row.stored?.imageUrl) : rows;
  const available = selectableLogoCategories(rows);

  const enableAll = () => {
    setOnlyMissing(false);
    setPicked(available);
    if (!available.length) toast.error("No category logos to select. Scan first.");
    else toast.success(`${available.length} logos selected. Nothing was imported.`);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <h1 className="text-xl font-extrabold">Category logos</h1>
        <p className="mt-1 text-sm text-muted">One logo is stored for a category. Services with no image of their own show it. A service that already has an image is left alone. Listing photos are not used as category logos.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button busy={busy === "scan"} onClick={() => void scan()}>Scan AccsZone</Button>
          <Button tone="soft" busy={busy === "all"} onClick={() => void runImport(true)}>Import high-confidence matches</Button>
          <Button tone="soft" busy={busy === "some"} onClick={() => void runImport(false)}>Import selected</Button>
          <Button tone="soft" onClick={enableAll}>Enable all</Button>
          <Button tone="soft" onClick={() => setPicked([])}>Deselect all</Button>
          <Button tone="soft" busy={busy === "refresh"} onClick={() => {
            setBusy("refresh");
            void refreshCategoryLogos().then((res) => {
              if (res.error) toast.error(res.error);
              else toast.success(res.updated ? `Refreshed ${res.updated} logos.` : "Stored logos already match AccsZone.");
              load();
            }).catch(() => toast.error("Refresh did not finish.")).finally(() => setBusy(""));
          }}>Refresh references</Button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          Replace an approved logo. Required for ambiguous matches and manual replacements.
        </label>
        <p className="mt-3 text-sm font-semibold">{picked.length} logo{picked.length === 1 ? "" : "s"} selected. Enable all only ticks them. Import still has to be pressed, and replacing an approved logo still needs the checkbox.</p>
        <p className="mt-3 text-sm text-muted">{summary.fetchedAt ? `Last scan ${summary.fetchedAt}. ` : "No scan yet. "}{summary.discovered} AccsZone categories, {summary.listingImages} listing images recorded, {summary.moreLinks} further pages not fully crawled. {summary.high} high-confidence matches, {summary.ambiguous} need approval, {summary.missing} categories have no logo. {summary.covered} services can inherit a stored logo.</p>
        {summary.note ? <p className="mt-1 text-xs text-muted">{summary.note}</p> : null}
        {errors.length ? <p className="mt-1 text-xs text-danger">{errors.join(" ")}</p> : null}
      </section>
      <section className="rounded-card border border-line bg-card p-4 shadow-card">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Manual logo" hint="Https image only. This does not change the service."><input className={inputClass} value={manualCategory} onChange={(e) => setManualCategory(e.target.value)} placeholder="Category name" /></Field>
          <Field label="Image URL"><input className={inputClass} value={manualUrl} onChange={(e) => setManualUrl(e.target.value)} placeholder="https://" /></Field>
          <Button tone="soft" onClick={() => void saveManualCategoryLogo({ data: { category: manualCategory, imageUrl: manualUrl, replace } }).then((res) => { if (res.error) toast.error(res.error); else { toast.success("Logo saved."); load(); } })}>Save manual logo</Button>
          <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Categories without logos</label>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="text-xs text-muted">
                <th className="p-2"></th>
                <th className="p-2">Category</th>
                <th className="p-2">Current</th>
                <th className="p-2">Discovered</th>
                <th className="p-2">Confidence</th>
                <th className="p-2">Source</th>
                <th className="p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.category} className="border-t border-line align-top">
                  <td className="p-2"><input type="checkbox" checked={picked.includes(row.category)} onChange={() => setPicked((prev) => prev.includes(row.category) ? prev.filter((name) => name !== row.category) : [...prev, row.category])} aria-label={`Select ${row.category}`} /></td>
                  <td className="p-2 font-semibold">{row.category}<span className="mt-1 block text-xs font-normal text-muted">{row.services} services · {row.customImages} already have their own image</span></td>
                  <td className="p-2">{row.stored?.imageUrl ? <img src={row.stored.imageUrl} alt="" className="size-10 rounded-lg bg-paper object-contain" /> : "None"}</td>
                  <td className="p-2">{row.imageUrl ? <img src={row.imageUrl} alt="" className="size-10 rounded-lg bg-paper object-contain" /> : "—"}<span className="mt-1 block text-xs text-muted">{row.discoveredName}</span></td>
                  <td className="p-2">{row.confidence ? `${Math.round(row.confidence * 100)}%` : "—"}</td>
                  <td className="p-2 text-xs">{row.page ? "AccsZone" : row.stored?.custom ? "Manual" : "—"}</td>
                  <td className="p-2 text-xs">{row.stored?.imageUrl ? (row.stored.custom ? "Approved" : "Imported") : row.status === "high" ? "Ready" : row.status === "ambiguous" ? "Needs approval" : "No match"}<span className="mt-1 block text-muted">{row.note}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length ? <p className="p-4 text-sm text-muted">No categories to show.</p> : null}
        </div>
      </section>
    </div>
  );
}
