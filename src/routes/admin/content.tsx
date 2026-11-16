import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { Announcement } from "@/lib/catalog";

export const Route = createFileRoute("/admin/content")({ component: ContentPage });

function ContentPage() {
  const faqs = useStore((s) => s.faqs);
  const saveFaqs = useStore((s) => s.saveFaqs);
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const resetDemo = useStore((s) => s.resetDemo);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [draft, setDraft] = useState(settings);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
        <h1 className="text-xl font-extrabold">FAQ</h1>
        {faqs.map((f) => (
          <div key={f.id} className="rounded-xl bg-paper p-3 text-sm">
            <p className="font-semibold">{f.question}</p>
            <p className="text-muted">{f.answer}</p>
            <button type="button" className="mt-1 text-xs font-semibold text-danger" onClick={() => { saveFaqs(faqs.filter((x) => x.id !== f.id)); toast.success("FAQ removed"); }}>Remove</button>
          </div>
        ))}
        <Field label="Question"><input className={inputClass} value={question} onChange={(e) => setQuestion(e.target.value)} /></Field>
        <Field label="Answer"><textarea className={inputClass} rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} /></Field>
        <Button onClick={() => {
          if (!question.trim() || !answer.trim()) return toast.error("Write both a question and an answer.");
          saveFaqs([...faqs, { id: "f" + Date.now(), question: question.trim(), answer: answer.trim() }]);
          setQuestion(""); setAnswer("");
          toast.success("FAQ added");
        }}>Add FAQ</Button>
      </section>
      <div className="space-y-4">
        <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="text-xl font-extrabold">Announcements</h2>
          <p className="text-sm text-muted">One list feeds the scrolling banner and the customer Announcements page. Hidden, scheduled and ended posts stay off both.</p>
          <AnnouncementManager />
        </section>
        <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="text-xl font-extrabold">Rates and community</h2>
          <Field label="Fallback naira per 1 USD" hint="The shop converts every dollar at ₦1,343. Cheap numbers, VPN and boosts are spread from ₦1,850 to ₦2,700. Prices already above ₦2,000 stay on your margin. Airtime, data and bills are not changed."><input className={inputClass} value={draft.usdNgn} onChange={(e) => setDraft({ ...draft, usdNgn: Number(e.target.value) })} /></Field>
          <Field label="Fallback markup percent" hint="Used when a product has no success rate and no override. 35 means the customer pays 135% of the provider price."><input className={inputClass} value={draft.margin} onChange={(e) => setDraft({ ...draft, margin: Number(e.target.value) })} /></Field>
          <Field label="Paystack site charge percent" hint="Extra percent the customer pays when funding the wallet. The wallet only receives the amount they chose."><input className={inputClass} value={draft.paystackPercent ?? 0} onChange={(e) => setDraft({ ...draft, paystackPercent: Number(e.target.value) })} /></Field>
          <Field label="Paystack flat charge (₦)" hint="Added on top of the percent. Set both to 0 to charge the wallet amount only."><input className={inputClass} value={draft.paystackFlat ?? 0} onChange={(e) => setDraft({ ...draft, paystackFlat: Number(e.target.value) })} /></Field>
          <Field label="Community name"><input className={inputClass} value={draft.community} onChange={(e) => setDraft({ ...draft, community: e.target.value })} /></Field>
          <Field label="Telegram link"><input className={inputClass} value={draft.telegram} onChange={(e) => setDraft({ ...draft, telegram: e.target.value })} /></Field>
          <Field label="WhatsApp link"><input className={inputClass} value={draft.whatsapp} onChange={(e) => setDraft({ ...draft, whatsapp: e.target.value })} /></Field>
          <Button onClick={() => { void saveSettings(draft).then((err) => err ? toast.error(err) : toast.success("Settings saved")); }}>Save settings</Button>
          <button type="button" className="block text-xs text-danger" onClick={() => { if (confirm("Reset the shop catalogue and customer balances?")) resetDemo(); }}>Reset shop data</button>
        </section>
      </div>
    </div>
  );
}

function blankForm() {
  return { title: "", body: "", active: true, startsAt: "", endsAt: "", email: false };
}

function statusOf(item: Announcement, now = Date.now()) {
  if (item.active === false) return "Hidden";
  if (item.startsAt && Number.isFinite(Date.parse(item.startsAt)) && Date.parse(item.startsAt) > now) return "Scheduled";
  if (item.endsAt && Number.isFinite(Date.parse(item.endsAt)) && Date.parse(item.endsAt) < now) return "Ended";
  return "Published";
}

function AnnouncementManager() {
  const items = useStore((s) => s.announcements);
  const setAnnouncements = useStore((s) => s.setAnnouncements);
  const addAnnouncement = useStore((s) => s.addAnnouncement);
  const [form, setForm] = useState(blankForm);
  const [editing, setEditing] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState("");
  const lock = useRef(false);

  const persist = async (next: Announcement[], ok: string) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    const err = await setAnnouncements(next);
    lock.current = false;
    setBusy(false);
    if (err) {
      toast.error(err);
      return false;
    }
    toast.success(ok);
    return true;
  };

  const reset = () => {
    setForm(blankForm());
    setEditing("");
  };

  const save = async () => {
    if (lock.current) return;
    const title = form.title.trim();
    const body = form.body.trim();
    if (!title) return toast.error("Add a title.");
    const startsAt = fromLocal(form.startsAt);
    const endsAt = fromLocal(form.endsAt);
    if (startsAt && endsAt && Date.parse(endsAt) < Date.parse(startsAt)) return toast.error("The end time is before the start time.");
    if (editing) {
      const next = items.map((item) => item.id === editing ? { ...item, title, body, active: form.active, startsAt, endsAt } : item);
      if (await persist(next, form.active ? "Announcement updated" : "Announcement hidden")) reset();
      return;
    }
    if (form.email) {
      lock.current = true;
      setBusy(true);
      const err = await addAnnouncement(title, body);
      lock.current = false;
      setBusy(false);
      if (err) return toast.error(err);
      if (!form.active || startsAt || endsAt) {
        const latest = useStore.getState().announcements;
        const created = latest.find((item) => item.title === title && item.body === body);
        if (created) {
          const patched = await persist(latest.map((item) => item.id === created.id ? { ...item, active: form.active, startsAt, endsAt } : item), "Posted and emailed to customers");
          if (patched) reset();
          return;
        }
      }
      toast.success("Posted and emailed to customers");
      reset();
      return;
    }
    const item: Announcement = {
      id: "ann" + Date.now(),
      title,
      body,
      createdAt: new Date().toISOString(),
      active: form.active,
      startsAt,
      endsAt,
    };
    if (await persist([item, ...items], form.active ? "Announcement published" : "Announcement saved as hidden")) reset();
  };

  const publishNow = (item: Announcement) => {
    const next = items.map((row) => row.id === item.id ? { ...row, active: true, startsAt: undefined, endsAt: statusOf(item) === "Ended" ? undefined : row.endsAt } : row);
    void persist(next, "Announcement published");
  };

  const remove = async (id: string) => {
    const next = items.filter((item) => item.id !== id);
    if (await persist(next, "Announcement deleted")) {
      setConfirmId("");
      if (editing === id) reset();
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Title"><input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      <Field label="Body"><textarea className={inputClass} rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
        Published — show on the banner and the Announcements page
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-muted">
          Starts
          <input className={`${inputClass} mt-1`} type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
        </label>
        <label className="block text-xs font-semibold text-muted">
          Ends
          <input className={`${inputClass} mt-1`} type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
        </label>
      </div>
      {editing ? null : (
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={form.email} onChange={(e) => setForm({ ...form, email: e.target.checked })} />
          Also email customers
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button busy={busy} onClick={() => void save()}>{busy ? "Saving…" : editing ? "Save changes" : form.active ? "Publish announcement" : "Save hidden"}</Button>
        {editing ? <Button tone="soft" disabled={busy} onClick={reset}>Cancel edit</Button> : null}
      </div>
      <div className="space-y-2">
        {items.map((item) => {
          const status = statusOf(item);
          return (
            <article key={item.id} className="rounded-xl bg-paper p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{item.title}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${status === "Published" ? "bg-[#e5f2f8] text-[#174C70]" : "bg-white text-muted"}`}>{status}</span>
              </div>
              {item.body ? <p className="mt-1 text-muted">{item.body}</p> : null}
              <p className="mt-1 text-xs text-muted">{item.startsAt ? `From ${new Date(item.startsAt).toLocaleString("en-NG")}` : "No start"}{item.endsAt ? ` · until ${new Date(item.endsAt).toLocaleString("en-NG")}` : ""}</p>
              {confirmId === item.id ? (
                <div className="mt-2 rounded-xl border border-line bg-card p-2">
                  <p className="text-xs font-semibold">Delete this announcement permanently?</p>
                  <div className="mt-2 flex gap-2">
                    <Button tone="danger" busy={busy} onClick={() => void remove(item.id)}>Delete</Button>
                    <Button tone="soft" disabled={busy} onClick={() => setConfirmId("")}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold">
                  <button type="button" className="text-primary" onClick={() => {
                    setEditing(item.id);
                    setConfirmId("");
                    setForm({
                      title: item.title,
                      body: item.body,
                      active: item.active !== false,
                      startsAt: toLocal(item.startsAt),
                      endsAt: toLocal(item.endsAt),
                      email: false,
                    });
                  }}>Edit</button>
                  <button type="button" className="text-primary" disabled={busy} onClick={() => status === "Published" ? void persist(items.map((row) => row.id === item.id ? { ...row, active: false } : row), "Announcement hidden") : publishNow(item)}>{status === "Published" ? "Hide" : "Publish"}</button>
                  <button type="button" className="text-danger" onClick={() => setConfirmId(item.id)}>Delete</button>
                </div>
              )}
            </article>
          );
        })}
        {!items.length ? <p className="text-sm text-muted">No announcements yet.</p> : null}
      </div>
    </div>
  );
}

function toLocal(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocal(value: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
