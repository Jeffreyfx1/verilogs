import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { when } from "@/lib/money";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/support")({ component: SupportPage });

function SupportPage() {
  const user = useUser();
  const add = useStore((s) => s.addTicket);
  const allTickets = useStore((s) => s.tickets);
  const tickets = useMemo(
    () => allTickets.filter((t) => t.userId === user?.id || t.email === user?.email),
    [allTickets, user?.id, user?.email],
  );
  const settings = useStore((s) => s.settings);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  if (!user) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="space-y-3 rounded-card border border-line bg-card p-5 shadow-card" onSubmit={(e) => {
        e.preventDefault();
        add({ email: user.email, subject, body });
        setSubject(""); setBody("");
        toast.success("Ticket sent");
      }}>
        <h1 className="text-2xl font-extrabold">Support</h1>
        <p className="text-sm text-muted">This stays in your account. For the public community, use the link below.</p>
        <Field label="Subject"><input className={inputClass} required value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message"><textarea className={inputClass} required rows={5} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <Button type="submit">Send</Button>
        <Link to="/community" className="block text-sm font-semibold text-primary">Join {settings.community}</Link>
      </form>
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <h2 className="font-bold">Your tickets</h2>
        <div className="scroll-pane mt-3 space-y-2">
          {tickets.map((t) => (
            <article key={t.id} className="rounded-xl bg-paper p-3 text-sm">
              <p className="font-semibold">{t.subject}</p>
              <p className="text-muted">{t.body}</p>
              <p className="mt-1 text-xs text-muted">{when(t.createdAt)}</p>
            </article>
          ))}
          {!tickets.length ? <p className="text-sm text-muted">No tickets yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
