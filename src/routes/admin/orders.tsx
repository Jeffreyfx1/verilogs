import { createFileRoute } from "@tanstack/react-router";
import { naira, when } from "@/lib/money";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/orders")({ component: OrdersPage });

function OrdersPage() {
  const orders = useStore((s) => s.orders);
  const users = useStore((s) => s.users);
  const tickets = useStore((s) => s.tickets);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Orders</h1>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        {orders.map((o) => (
          <div key={o.id} className="border-b border-line px-4 py-3 text-sm">
            <div className="flex justify-between gap-3"><span className="font-semibold">{o.title}</span><span>{naira(o.amount)} · {o.status}</span></div>
            <p className="text-xs text-muted">{users.find((u) => u.id === o.userId)?.email} · {[o.server, o.network, o.phone, o.code && `code ${o.code}`, when(o.createdAt)].filter(Boolean).join(" · ")}</p>
          </div>
        ))}
        {!orders.length ? <p className="p-4 text-sm text-muted">No orders yet.</p> : null}
      </div>
      <h2 className="text-xl font-extrabold">Support tickets</h2>
      <div className="space-y-2">
        {tickets.map((t) => (
          <article key={t.id} className="rounded-card border border-line bg-card p-4 text-sm">
            <p className="font-semibold">{t.subject}</p>
            <p className="text-muted">{t.body}</p>
            <p className="mt-1 text-xs text-muted">{t.email} · {when(t.createdAt)}</p>
          </article>
        ))}
        {!tickets.length ? <p className="text-sm text-muted">No tickets.</p> : null}
      </div>
    </div>
  );
}
