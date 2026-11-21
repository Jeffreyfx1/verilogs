import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { CmsHtml, RichTextEditor } from "@/components/rich-text";
import { Button, Field, inputClass } from "@/components/ui";
import { publishWebsite, restoreWebsite, saveWebsiteDraft, unpublishWebsite, websitePage, websitePages } from "@/lib/cms-fns";

export const Route = createFileRoute("/admin/website")({ component: WebsiteAdmin });

type ListRow = { slug: string; path: string; title: string; published: boolean; updatedAt: string; updatedBy: string };
type Version = { id: string; title: string; kind: string; created_at: string; created_by: string };
type Detail = {
  slug: string;
  title: string;
  draftHtml: string;
  publicHtml: string;
  published: boolean;
  adminNote: string;
  updatedAt: string;
  updatedBy: string;
  versions: Version[];
};

function WebsiteAdmin() {
  const [rows, setRows] = useState<ListRow[]>([]);
  const [slug, setSlug] = useState("");
  const [page, setPage] = useState<Detail | null>(null);
  const [title, setTitle] = useState("");
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadList = () => {
    websitePages()
      .then((res) => {
        if (res.error) return toast.error(res.error);
        setRows(res.pages);
      })
      .catch(() => toast.error("Could not load website pages."));
  };

  const open = (next: string) => {
    setSlug(next);
    setPreview(false);
    websitePage({ data: { slug: next } })
      .then((res) => {
        if (res.error || !res.page) return toast.error(res.error || "Page not found.");
        setPage(res.page);
        setTitle(res.page.title);
        setDraft(res.page.draftHtml);
        setNote(res.page.adminNote);
      })
      .catch(() => toast.error("Could not open that page."));
  };

  useEffect(loadList, []);

  const run = async (work: () => Promise<{ error: string | null; slug?: string }>, ok: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await work();
      if (res.error) toast.error(res.error);
      else {
        toast.success(ok);
        loadList();
        open(res.slug || slug);
      }
    } catch {
      toast.error("That did not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Website content</h1>
        <p className="mt-1 text-sm text-muted">Drafts stay private until you publish. Admin notes never appear on the public site. FAQ questions already saved under Content and settings stay in that list.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <div className="flex gap-2 overflow-x-auto lg:block lg:space-y-2">
          {rows.map((row) => (
            <button
              key={row.slug}
              type="button"
              className={`shrink-0 rounded-2xl border px-3 py-3 text-left text-sm lg:w-full ${slug === row.slug ? "border-primary bg-card" : "border-line bg-card"}`}
              onClick={() => open(row.slug)}
            >
              <span className="block font-bold">{row.title}</span>
              <span className="text-xs text-muted">{row.published ? "Published" : "Not published"}{row.path ? ` · ${row.path}` : ""}</span>
            </button>
          ))}
        </div>
        {page ? (
          <div className="space-y-4">
            <section className="space-y-3 rounded-card border border-line bg-card p-4">
              <Field label="Title">
                <input className={`${inputClass} text-base`} value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Public content" hint="Headings, bold, italic, lists and links. Preview shows the draft, not the live page.">
                <RichTextEditor value={draft} onChange={setDraft} />
              </Field>
              <Field label="Private admin note" hint="Only admins see this. It is not included in the public page.">
                <textarea className={`${inputClass} min-h-24 text-base`} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void run(() => saveWebsiteDraft({ data: { slug, title, draftHtml: draft, adminNote: note } }), "Draft saved")}>Save draft</Button>
                <Button tone="soft" disabled={busy} onClick={() => setPreview((on) => !on)}>{preview ? "Hide preview" : "Preview"}</Button>
                <Button tone="soft" disabled={busy} onClick={() => void run(() => publishWebsite({ data: { slug } }), "Published")}>Publish</Button>
                <Button tone="soft" disabled={busy || !page.published} onClick={() => void run(() => unpublishWebsite({ data: { slug } }), "Unpublished")}>Unpublish</Button>
              </div>
              <p className="text-xs text-muted">{page.published ? "Live on the website." : "The public page still uses the built-in text."} Last change {page.updatedAt ? page.updatedAt.slice(0, 16).replace("T", " ") : "—"} by {page.updatedBy || "—"}.</p>
            </section>
            {preview ? (
              <article className="rounded-card border border-line bg-paper p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Draft preview</p>
                <h2 className="mt-2 text-2xl font-extrabold">{title}</h2>
                <div className="mt-3"><CmsHtml html={draft} /></div>
              </article>
            ) : null}
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="font-extrabold">Live copy</h2>
              <div className="mt-2">{page.publicHtml ? <CmsHtml html={page.publicHtml} /> : <p className="text-sm text-muted">Nothing published yet.</p>}</div>
            </section>
            <section className="space-y-2 rounded-card border border-line bg-card p-4">
              <h2 className="font-extrabold">Version history</h2>
              {page.versions.length === 0 ? <p className="text-sm text-muted">No saved versions yet.</p> : null}
              {page.versions.map((version) => (
                <div key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2 text-sm">
                  <div>
                    <p className="font-semibold capitalize">{version.kind}</p>
                    <p className="text-xs text-muted">{version.created_at.slice(0, 16).replace("T", " ")} · {version.created_by || "admin"}</p>
                  </div>
                  <Button tone="soft" disabled={busy} onClick={() => {
                    if (!confirm("Restore this version onto the public page? Older versions stay in the history.")) return;
                    void run(() => restoreWebsite({ data: { id: version.id } }), "Version restored");
                  }}>Restore</Button>
                </div>
              ))}
            </section>
          </div>
        ) : (
          <p className="rounded-card border border-line bg-card p-4 text-sm text-muted">Choose a page. Nothing is published until you press Publish.</p>
        )}
      </div>
    </div>
  );
}
