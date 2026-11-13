import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { naira, when } from "@/lib/money";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/dashboard/history")({ component: HistoryPage });

function HistoryPage() {
  const [tab, setTab] = useState<"numbers" | "bills" | "txns">("numbers");
  const allOrders = useStore((s) => s.orders);
  const allTxns = useStore((s) => s.txns);
  const session = useStore((s) => s.sessionUserId);
  const orders = useMemo(() => allOrders.filter((o) => o.userId === session), [allOrders, session]);
  const txns = useMemo(() => allTxns.filter((t) => t.userId === session), [allTxns, session]);
  const numbers = orders.filter((o) => o.category === "numbers");
  const bills = orders.filter((o) => o.category !== "numbers");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">History</h1>
      <div className="flex flex-wrap gap-2">
        {([["numbers", "Numbers"], ["bills", "Bills"], ["txns", "Transactions"]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === id ? "bg-primary text-on-primary" : "border border-line bg-card"}`}>{label}</button>
        ))}
      </div>
      <div className="scroll-tall rounded-card border border-line bg-card">
        {tab === "txns" ? txns.map((t) => (
          <div key={t.id} className="flex items-center justify-between border-b border-line px-4 py-3 text-sm">
            <span>{t.note}<span className="block text-xs text-muted">{when(t.createdAt)}</span></span>
            <span className={t.amount < 0 ? "text-danger" : "text-ok"}>{naira(t.amount)}</span>
          </div>
        )) : (tab === "numbers" ? numbers : bills).map((o) => (
          <div key={o.id} className="border-b border-line px-4 py-3 text-sm">
            <div className="flex justify-between gap-3"><span className="font-semibold">{o.title}</span><span>{naira(o.amount)}</span></div>
            <p className="text-xs text-muted">{[o.server, o.network, o.phone, o.code && `code ${o.code}`, o.status, when(o.createdAt)].filter(Boolean).join(" · ")}</p>
          </div>
        ))}
        {((tab === "txns" && !txns.length) || (tab === "numbers" && !numbers.length) || (tab === "bills" && !bills.length)) ? <p className="p-6 text-sm text-muted">Nothing here yet.</p> : null}
      </div>
    </div>
  );
}
