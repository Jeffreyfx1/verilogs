import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/content")({ component: ContentPage });

function ContentPage() {
  const faqs = useStore((s) => s.faqs);
  const saveFaqs = useStore((s) => s.saveFaqs);
  const addAnnouncement = useStore((s) => s.addAnnouncement);
  const announcements = useStore((s) => s.announcements);
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const resetDemo = useStore((s) => s.resetDemo);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(settings);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
        <h1 className="text-xl font-extrabold">FAQ</h1>
        {faqs.map((f) => (
          <div key={f.id} className="rounded-xl bg-paper p-3 text-sm">
            <p className="font-semibold">{f.question}</p>
            <p className="text-muted">{f.answer}</p>
            <button type="button" className="mt-1 text-xs font-semibold text-danger" onClick={() => saveFaqs(faqs.filter((x) => x.id !== f.id))}>Remove</button>
          </div>
        ))}
        <Field label="Question"><input className={inputClass} value={question} onChange={(e) => setQuestion(e.target.value)} /></Field>
        <Field label="Answer"><textarea className={inputClass} rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} /></Field>
        <Button onClick={() => {
          if (!question.trim() || !answer.trim()) return;
          saveFaqs([...faqs, { id: "f" + Date.now(), question, answer }]);
          setQuestion(""); setAnswer("");
        }}>Add FAQ</Button>
      </section>
      <div className="space-y-4">
        <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="text-xl font-extrabold">Announcement</h2>
          <Field label="Title"><input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Body"><textarea className={inputClass} rows={3} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <Button onClick={() => { if (!title.trim()) return; addAnnouncement(title, body); setTitle(""); setBody(""); toast.success("Posted"); }}>Post</Button>
          <ul className="text-sm text-muted">{announcements.slice(0, 4).map((a) => <li key={a.id}>{a.title}</li>)}</ul>
        </section>
        <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="text-xl font-extrabold">Rates and community</h2>
          <Field label="Naira per 1 USD"><input className={inputClass} value={draft.usdNgn} onChange={(e) => setDraft({ ...draft, usdNgn: Number(e.target.value) })} /></Field>
          <Field label="Margin percent" hint="Applies the next time you import. Existing prices stay until you sync again."><input className={inputClass} value={draft.margin} onChange={(e) => setDraft({ ...draft, margin: Number(e.target.value) })} /></Field>
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
