import { adminStatusLabel, customerStatusLabel, statusTone, type ComplaintEvent, type ComplaintMessage } from "@/lib/complaints";
import { when } from "@/lib/money";

export function StatusPill({ status, admin = false }: { status: string; admin?: boolean }) {
  const label = admin ? adminStatusLabel(status) : customerStatusLabel(status);
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-extrabold ${statusTone(status)}`}>{label}</span>;
}

export function ComplaintThread({ messages, viewer }: { messages: ComplaintMessage[]; viewer: "customer" | "admin" }) {
  const visible = messages.filter((item) => viewer === "admin" || !item.internal);
  if (!visible.length) return <p className="text-sm text-muted">No messages yet.</p>;
  return (
    <div className="space-y-3">
      {visible.map((item) => {
        const mine = viewer === "admin" ? item.role === "admin" : item.role === "customer";
        const who = item.internal ? "Internal note" : item.role === "admin" ? (viewer === "admin" ? "Verilogs" : "Verilogs support") : viewer === "customer" ? "You" : "Customer";
        return (
          <article key={item.id} className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm ${item.internal ? "border border-dashed border-amber-400 bg-amber-50" : mine ? "ml-auto bg-[#E5F2F8]" : "bg-paper"}`}>
            <p className="text-xs font-extrabold text-[#174C70]">{who}</p>
            <p className="mt-1 whitespace-pre-wrap">{item.body}</p>
            <p className="mt-1 text-xs text-muted">{when(item.createdAt)}</p>
          </article>
        );
      })}
    </div>
  );
}

export function StatusHistory({ events, admin = false }: { events: ComplaintEvent[]; admin?: boolean }) {
  if (!events.length) return null;
  return (
    <section className="rounded-card border border-line bg-card p-4 shadow-card">
      <h2 className="font-bold">Status history</h2>
      <ol className="mt-3 space-y-2">
        {events.map((event) => (
          <li key={event.id} className="text-sm">
            <p className="font-semibold">{event.note || "Updated"} · {event.toStatus ? (admin ? adminStatusLabel(event.toStatus) : customerStatusLabel(event.toStatus)) : ""}</p>
            <p className="text-xs text-muted">{event.actorRole === "admin" ? "Verilogs" : "Customer"} · {when(event.createdAt)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
