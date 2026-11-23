import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { providerMapping, repairMappings } from "@/lib/shop-fns";
import { Button } from "@/components/ui";

export const Route = createFileRoute("/admin/mapping")({ component: MappingDesk });

type Report = Awaited<ReturnType<typeof providerMapping>>;

const FILTERS = ["all", "ok", "missing_provider", "missing_credentials", "missing_service_id", "needs_review"] as const;

function MappingDesk() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (next = filter) => {
    const res = await providerMapping({ data: { filter: next } });
    setReport(res);
    if (res.error) toast.error(res.error);
  };

  useEffect(() => {
    void load(filter);
  }, [filter]);

  const repair = async () => {
    setBusy(true);
    try {
      const res = await repairMappings();
      if (res.error) toast.error(res.error);
      else toast.success(`Repaired ${res.repaired}. ${res.review} still need review. Mirrored ${res.mirrored} keys.`);
      await load(filter);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Provider mapping</h1>
          <p className="mt-1 text-sm text-muted">Each imported product and whether purchase can find its provider credentials. Keys are never shown.</p>
        </div>
        <Button busy={busy} onClick={() => void repair()}>Repair confident mappings</Button>
      </div>
      {report?.error ? <p className="text-sm text-danger">{report.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-3 py-1 text-xs font-extrabold ${filter === item ? "bg-primary text-white" : "bg-paper text-ink"}`}>
            {item.replaceAll("_", " ")} {report?.counts?.[item] ?? (item === "all" ? report?.total : 0)}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {(report?.rows || []).map((row) => (
          <article key={row.id} className="rounded-2xl border border-line bg-card p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-extrabold">{row.name}</p>
              <span className="rounded-full bg-paper px-2 py-1 text-xs font-extrabold">{row.status.replaceAll("_", " ")}</span>
            </div>
            <p className="mt-1 text-xs text-muted">{row.category} · provider {row.providerName || "none"} · service {row.externalId || "missing"}{row.serverId ? ` · server ${row.serverId}` : ""}</p>
            {row.reason ? <p className="mt-1 text-xs">{row.reason}</p> : null}
          </article>
        ))}
        {!report?.rows.length ? <p className="text-sm text-muted">Nothing in this filter.</p> : null}
      </div>
    </div>
  );
}
