import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { StatusPill } from "@/components/complaint-view";
import { Button, Field, inputClass } from "@/components/ui";
import { COMPLAINT_CATEGORIES, type ComplaintRow } from "@/lib/complaints";
import { when } from "@/lib/money";
import { listMyComplaints, submitComplaint } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/dashboard/complaints")({ component: ComplaintsPage });

function readShot(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (!file.size) {
      resolve("");
      return;
    }
    if (file.size > 350_000) {
      reject(new Error("Screenshot must be under 350KB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that screenshot."));
    reader.readAsDataURL(file);
  });
}

function ComplaintsPage() {
  const boot = useStore((s) => s.boot);
  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [shot, setShot] = useState("");
  const [shotName, setShotName] = useState("");
  const [busy, setBusy] = useState(false);
  const key = useRef(crypto.randomUUID());
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    listMyComplaints()
      .then((res) => {
        if (res.error) setError(res.error);
        else setError("");
        setRows(Array.isArray(res.rows) ? res.rows : []);
      })
      .catch(() => setError("Could not load your complaints."))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form
        className="space-y-3 rounded-card border border-line bg-card p-5 shadow-card"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          void submitComplaint({ data: { subject, category, body, orderRef, screenshot: shot, clientKey: key.current } })
            .then((res) => {
              if (res.error) {
                toast.error(res.error);
                return;
              }
              toast.success(res.duplicate ? `Already submitted · ${res.reference}` : `Complaint ${res.reference} sent`);
              key.current = crypto.randomUUID();
              setSubject("");
              setCategory("");
              setBody("");
              setOrderRef("");
              setShot("");
              setShotName("");
              if (fileRef.current) fileRef.current.value = "";
              boot(true);
              load();
            })
            .catch(() => toast.error("Could not send that complaint."))
            .finally(() => setBusy(false));
        }}
      >
        <h1 className="text-2xl font-extrabold">Submit a complaint</h1>
        <p className="text-sm text-muted">You get a reference number. Replies from Verilogs show in your notification bell and open this complaint.</p>
        <Field label="Category">
          <select className={inputClass} required value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Choose</option>
            {COMPLAINT_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Subject"><input className={inputClass} required maxLength={140} value={subject} onChange={(event) => setSubject(event.target.value)} /></Field>
        <Field label="What happened"><textarea className={inputClass} required rows={5} maxLength={4000} value={body} onChange={(event) => setBody(event.target.value)} /></Field>
        <Field label="Order number" hint="Optional. Only an order on your account can be attached.">
          <input className={inputClass} value={orderRef} onChange={(event) => setOrderRef(event.target.value)} placeholder="Order id" />
        </Field>
        <Field label="Screenshot" hint="Optional PNG, JPG or WebP under 350KB.">
          <input
            ref={fileRef}
            className={inputClass}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                setShot("");
                setShotName("");
                return;
              }
              void readShot(file).then((url) => {
                setShot(url);
                setShotName(file.name);
              }).catch((err: unknown) => {
                setShot("");
                setShotName("");
                toast.error(err instanceof Error ? err.message : "Could not read that screenshot.");
              });
            }}
          />
        </Field>
        {shotName ? <p className="text-xs text-muted">{shotName}</p> : null}
        <Button type="submit" busy={busy}>{busy ? "Sending…" : "Submit complaint"}</Button>
      </form>
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <h2 className="font-bold">My complaints</h2>
        {loading ? <p className="mt-3 text-sm text-muted">Loading complaints…</p> : null}
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-3 space-y-2">
          {rows.map((row) => (
            <Link key={row.id} to="/dashboard/complaints/$id" params={{ id: row.id }} className="block rounded-xl bg-paper p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-extrabold">{row.reference}</p>
                <StatusPill status={row.status} />
              </div>
              <p className="mt-1 font-semibold">{row.subject}</p>
              <p className="text-xs text-muted">{row.category} · {when(row.createdAt)}{row.customerUnread ? " · new reply" : ""}</p>
              {row.adminReply ? <p className="mt-2 text-muted">Latest reply: {row.adminReply.slice(0, 160)}</p> : <p className="mt-2 text-muted">Waiting for a reply.</p>}
            </Link>
          ))}
          {!loading && !rows.length ? <p className="text-sm text-muted">No complaints yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
