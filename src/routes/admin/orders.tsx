import { createFileRoute } from "@tanstack/react-router";
import { naira, when } from "@/lib/money";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/orders")({ component: OrdersPage });

function OrdersPage() {
  const orders = useStore((s) => s.orders);
  const users = useStore((s) => s.users);
  const tickets = useStore((s) => s.tickets);
  const gain = orders.reduce((sum, order) => sum + (order.status === "refunded" ? 0 : order.gain || 0), 0);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-extrabold">Orders</h1>
      <p className="text-sm text-muted">Customers pay your price. The API is charged its own price from the balance you topped up there. Your gain is the difference.</p>
      <p className="text-sm font-extrabold">Gain so far {naira(gain)}</p>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        {orders.map((o) => (
          <div key={o.id} className="border-b border-line px-4 py-3 text-sm">
            <div className="flex justify-between gap-3"><span className="font-semibold">{o.title}</span><span>{naira(o.amount)} · {o.status}</span></div>
            <p className="text-xs text-muted">{users.find((u) => u.id === o.userId)?.email} · paid {naira(o.amount)} · API {naira(o.cost || 0)} · gain {naira(o.status === "refunded" ? 0 : o.gain || 0)}</p>
            <p className="text-xs text-muted">{[o.server, o.network, o.phone, o.code && `ref ${o.code}`, when(o.createdAt)].filter(Boolean).join(" · ")}</p>
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
