import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { webhookDesk } from "@/lib/shop-fns";
import { when } from "@/lib/money";

export const Route = createFileRoute("/admin/webhooks")({ component: WebhookHealth });

type Desk = Awaited<ReturnType<typeof webhookDesk>>;

function tone(health: string) {
  if (health === "Working") return "bg-emerald-50 text-emerald-800";
  if (health === "Configured but untested") return "bg-amber-50 text-amber-900";
  if (health === "Failed" || health === "Requires attention") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function WebhookHealth() {
  const [desk, setDesk] = useState<Desk | null>(null);
  useEffect(() => {
    webhookDesk().then(setDesk).catch(() => toast.error("Could not load webhook health."));
  }, []);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">API webhook health</h1>
        <p className="mt-1 text-sm text-muted">A provider is marked working only after this app has accepted a real event. An endpoint existing is not enough.</p>
      </div>
      {desk?.error ? <p className="text-sm text-danger">{desk.error}</p> : null}
      <div className="space-y-3">
        {(desk?.rows || []).map((row) => (
          <article key={row.id} className="rounded-2xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold">{row.name}</h2>
              <span className={`rounded-full px-2 py-1 text-xs font-extrabold ${tone(row.health)}`}>{row.health}</span>
            </div>
            <dl className="mt-3 space-y-1 text-sm">
              <p><span className="text-muted">Support: </span>{row.support}</p>
              <p><span className="text-muted">Endpoint: </span>{row.endpoint}</p>
              <p><span className="text-muted">Registration: </span>{row.registration}</p>
              <p><span className="text-muted">Signature: </span>{row.signature}</p>
              <p><span className="text-muted">Last event: </span>{row.lastEvent ? when(row.lastEvent) : "None stored"}</p>
              <p><span className="text-muted">Accepted {row.ok} · Failed {row.failed} · Duplicates {row.duplicate} · Rejected {row.rejected}</span></p>
            </dl>
            <p className="mt-2 text-sm text-muted">{row.note}</p>
          </article>
        ))}
      </div>
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-extrabold">Recent events</h2>
        <div className="mt-3 space-y-2">
          {(desk?.log || []).map((item) => (
            <p key={item.id} className="rounded-xl bg-paper px-3 py-2 text-sm">
              <span className="font-extrabold">{item.provider}</span> · {item.status} · {item.summary}
              {item.error ? ` · ${item.error}` : ""} {item.duplicates ? ` · duplicates ${item.duplicates}` : ""}
              <span className="mt-1 block text-xs text-muted">{when(item.created_at)}</span>
            </p>
          ))}
          {!desk?.log?.length ? <p className="text-sm text-muted">No webhook events stored.</p> : null}
        </div>
      </section>
    </div>
  );
}
