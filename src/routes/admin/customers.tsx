import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, inputClass } from "@/components/ui";
import { naira } from "@/lib/money";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/customers")({ component: CustomersPage });

function CustomersPage() {
  const users = useStore((s) => s.users);
  const adjust = useStore((s) => s.adjustBalance);
  const mail = useStore((s) => s.mailUser);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [subject, setSubject] = useState("A note from VeriLogs");
  const [body, setBody] = useState("");
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-extrabold">Customers</h1>
      <p className="text-sm text-muted">Wallet changes and messages show up in the customer's notifications.</p>
      {users.map((u) => (
        <article key={u.id} className="space-y-3 rounded-card border border-line bg-card p-4 text-sm shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">{u.name} · {u.role}</p>
              <p className="text-xs text-muted">{u.email} · {u.phone} · {u.google ? "Google linked" : "Password"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{naira(u.balance)}</span>
              <input className={`${inputClass} w-28`} inputMode="numeric" placeholder="± amount" value={amounts[u.id] || ""} onChange={(e) => setAmounts({ ...amounts, [u.id]: e.target.value })} />
              <Button tone="soft" onClick={() => {
                const n = Number(amounts[u.id]);
                if (!Number.isFinite(n) || n === 0) return toast.error("Enter an amount, negative to deduct.");
                void adjust(u.id, Math.round(n), "Admin adjustment").then((err) => err ? toast.error(err) : toast.success("Wallet updated"));
              }}>Apply</Button>
            </div>
          </div>
          {u.role !== "admin" ? (
            <div className="flex flex-wrap gap-2">
              <input className={`${inputClass} min-w-40 flex-1`} value={subject} onChange={(e) => setSubject(e.target.value)} />
              <input className={`${inputClass} min-w-40 flex-1`} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" />
              <Button tone="soft" onClick={() => void mail(u.id, subject, body).then((err) => err ? toast.error(err) : toast.success("Sent"))}>Message</Button>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
