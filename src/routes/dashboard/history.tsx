import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { BtnSpinner } from "@/components/ui";
import { naira, when } from "@/lib/money";
import { historyFilterFromHash, listPurchases, orderQuantity, pagePurchases, purchaseTypeLabel, type HistoryFilter } from "@/lib/purchase-history";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/dashboard/history")({ component: HistoryPage });

const FILTERS: Array<[HistoryFilter, string]> = [
  ["all", "All purchases"],
  ["logs", "Logs"],
  ["vpn", "VPN"],
  ["numbers", "Numbers"],
  ["other", "Other products"],
];

function statusClass(status: string) {
  if (status === "refunded") return "bg-red-50 text-red-700";
  if (status === "waiting") return "bg-amber-50 text-amber-800";
  if (status === "received" || status === "completed") return "bg-emerald-50 text-emerald-800";
  return "bg-slate-100 text-slate-700";
}

function HistoryPage() {
  const hash = useRouterState({ select: (s) => String(s.location.hash || "") });
  const start = historyFilterFromHash(hash);
  const [filter, setFilter] = useState<HistoryFilter>(start);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState("");
  useEffect(() => { setFilter(start); }, [start]);
  const allOrders = useStore((s) => s.orders);
  const session = useStore((s) => s.sessionUserId);
  const refillOrder = useStore((s) => s.refillOrder);
  const matched = useMemo(() => listPurchases(allOrders, { userId: session || "", filter, q }), [allOrders, session, filter, q]);
  const shown = pagePurchases(matched, 20, page);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Order history</h1>
        <p className="mt-1 text-sm text-muted">Every purchase on this account. Logs, VPN, numbers and other digital products stay in one list.</p>
      </div>
      <input className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-base" placeholder="Search purchases" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => { setFilter(id); setPage(1); }} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${filter === id ? "bg-primary text-on-primary" : "border border-line bg-card"}`}>{label}</button>
        ))}
      </div>
      <div className="space-y-2">
        {shown.rows.map((order) => (
          <article key={order.id} className="rounded-2xl border border-line bg-card px-4 py-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#0c6e8a]">{purchaseTypeLabel(order.category)}</p>
                <h2 className="mt-0.5 break-words font-extrabold">{order.title}</h2>
              </div>
              <p className="shrink-0 font-extrabold">{naira(order.amount)}</p>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className={`rounded-full px-2 py-1 font-bold ${statusClass(order.status)}`}>{order.status}</span>
              <span className="text-muted">{when(order.createdAt)}</span>
              <span className="text-muted">Qty {orderQuantity(order.detail || "")}</span>
            </div>
            <p className="mt-2 break-words text-xs leading-relaxed text-muted">{[order.server, order.network, order.phone, order.code && `code ${order.code}`, order.providerStatus, order.detail && !order.detail.startsWith("{") ? order.detail : ""].filter(Boolean).join(" · ")}</p>
            <Link to="/purchase-result/$orderId" params={{ orderId: order.id }} className="mt-2 inline-block text-xs font-extrabold text-primary">Open delivery</Link>
            {order.category === "smm" && order.refillAvailable && order.providerOrderId && order.status !== "refunded" ? (
              <button
                type="button"
                disabled={busy === order.id}
                className="mt-2 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1 text-xs font-bold disabled:opacity-60"
                onClick={() => {
                  if (busy) return;
                  setBusy(order.id);
                  void refillOrder(order.id).then((err) => {
                    setBusy("");
                    if (err) toast.error(err);
                    else toast.success("Refill requested");
                  });
                }}
              >
                {busy === order.id ? <BtnSpinner /> : null}
                {busy === order.id ? "Requesting refill…" : order.refillId ? "Request refill again" : "Request refill"}
              </button>
            ) : null}
          </article>
        ))}
        {!shown.rows.length ? <p className="rounded-2xl border border-line bg-card p-6 text-sm text-muted">No purchases match this view.</p> : null}
      </div>
      {shown.more ? <button type="button" className="w-full rounded-xl border border-line bg-card py-2.5 text-sm font-extrabold" onClick={() => setPage((n) => n + 1)}>Show more</button> : null}
    </div>
  );
}
