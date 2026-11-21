import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { deleteVeraArticle, previewVera, saveVeraArticle, veraKnowledge } from "@/lib/cms-fns";
import { VERA_CATEGORIES, VERA_SEED } from "@/lib/vera-mind";

export const Route = createFileRoute("/admin/vera")({ component: VeraKnowledgeAdmin });

type Row = { id: string; category: string; title: string; body: string; enabled: boolean; updated_at: string; updated_by: string };

const builtIn = new Set(VERA_SEED.map((item) => item.id));

function VeraKnowledgeAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [category, setCategory] = useState<string>(VERA_CATEGORIES[0]);
  const [filter, setFilter] = useState("All");
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [question, setQuestion] = useState("Why is my money not showing?");
  const [preview, setPreview] = useState("");
  const [used, setUsed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = () => {
    veraKnowledge()
      .then((res) => {
        if (res.error) return toast.error(res.error);
        setRows(res.rows);
      })
      .catch(() => toast.error("Could not load Vera’s knowledge."));
  };

  useEffect(load, []);

  const edit = (row: Row) => {
    setId(row.id);
    setCategory(row.category);
    setTitle(row.title);
    setBody(row.body);
    setEnabled(row.enabled);
  };

  const reset = () => {
    setId("");
    setTitle("");
    setBody("");
    setEnabled(true);
  };

  const shown = rows.filter((row) => filter === "All" || row.category === filter);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Vera knowledge</h1>
        <p className="mt-1 text-sm text-muted">Vera reads only the articles that match a question. Turning one off or saving a new one is available on the next chat, without a new deployment. Built-in articles can be edited or switched off, not deleted.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {["All", ...VERA_CATEGORIES].map((name) => (
          <button key={name} type="button" className={`shrink-0 rounded-full border px-3 py-2 text-xs font-bold ${filter === name ? "border-primary bg-primary text-on-primary" : "border-line bg-card"}`} onClick={() => setFilter(name)}>
            {name}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          {shown.map((row) => (
            <button key={row.id} type="button" className="block w-full rounded-card border border-line bg-card p-3 text-left" onClick={() => edit(row)}>
              <p className="text-xs text-muted">{row.category}{row.enabled ? "" : " · off"}</p>
              <p className="font-bold">{row.title}</p>
              <p className="line-clamp-2 text-sm text-muted">{row.body}</p>
            </button>
          ))}
        </section>
        <section className="space-y-3 rounded-card border border-line bg-card p-4">
          <h2 className="font-extrabold">{id ? "Edit article" : "New article"}</h2>
          <Field label="Category">
            <select className={`${inputClass} text-base`} value={category} onChange={(e) => setCategory(e.target.value)}>
              {VERA_CATEGORIES.map((name) => <option key={name}>{name}</option>)}
            </select>
          </Field>
          <Field label="Title"><input className={`${inputClass} text-base`} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="What Vera should know"><textarea className={`${inputClass} min-h-40 text-base`} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Vera can use this
          </label>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => {
              setBusy(true);
              saveVeraArticle({ data: { id, category, title, body, enabled } })
                .then((res) => {
                  if (res.error) return toast.error(res.error);
                  toast.success("Knowledge saved");
                  reset();
                  load();
                })
                .catch(() => toast.error("Could not save."))
                .finally(() => setBusy(false));
            }}>Save</Button>
            <Button tone="soft" onClick={reset}>Clear</Button>
            {id && !builtIn.has(id) ? (
              <Button tone="danger" disabled={busy} onClick={() => {
                if (!confirm("Remove this article from Vera?")) return;
                setBusy(true);
                deleteVeraArticle({ data: { id } })
                  .then((res) => {
                    if (res.error) return toast.error(res.error);
                    toast.success("Article removed");
                    reset();
                    load();
                  })
                  .finally(() => setBusy(false));
              }}>Delete</Button>
            ) : null}
          </div>
          <div className="border-t border-line pt-3">
            <Field label="Preview a question" hint="Uses matching knowledge only. This preview is not saved as a customer conversation.">
              <input className={`${inputClass} text-base`} value={question} onChange={(e) => setQuestion(e.target.value)} />
            </Field>
            <Button tone="soft" className="mt-2" onClick={() => {
              previewVera({ data: { question } })
                .then((res) => {
                  if (res.error || !res.preview) return toast.error(res.error || "No preview.");
                  setPreview(res.preview.text);
                  setUsed(res.preview.used);
                })
                .catch(() => toast.error("Preview failed."));
            }}>Preview answer</Button>
            {preview ? (
              <div className="mt-3 rounded-xl bg-paper p-3 text-sm">
                <p className="whitespace-pre-wrap">{preview}</p>
                <p className="mt-2 text-xs text-muted">Articles used: {used.length ? used.join(", ") : "none"}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
