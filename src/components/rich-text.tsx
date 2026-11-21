import { useRef, useState } from "react";
import { sanitizeHtml } from "@/lib/site-pages";

function wrap(el: HTMLTextAreaElement, before: string, after: string, value: string, onChange: (next: string) => void) {
  const start = el.selectionStart || 0;
  const end = el.selectionEnd || 0;
  const selected = value.slice(start, end) || "Text";
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  onChange(next);
  requestAnimationFrame(() => {
    el.focus();
    const cursor = start + before.length + selected.length + after.length;
    el.setSelectionRange(cursor, cursor);
  });
}

export function RichTextEditor({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);
  const [link, setLink] = useState("https://");
  const apply = (before: string, after: string) => {
    if (ref.current) wrap(ref.current, before, after, value, onChange);
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-1 overflow-x-auto pb-1">
        <Tool label="Heading" onClick={() => apply("<h2>", "</h2>")} />
        <Tool label="Paragraph" onClick={() => apply("<p>", "</p>")} />
        <Tool label="Bold" onClick={() => apply("<strong>", "</strong>")} />
        <Tool label="Italic" onClick={() => apply("<em>", "</em>")} />
        <Tool label="Bullets" onClick={() => apply("<ul><li>", "</li></ul>")} />
        <Tool label="Numbers" onClick={() => apply("<ol><li>", "</li></ol>")} />
        <Tool label="Link" onClick={() => apply(`<a href="${link.replace(/"/g, "")}">`, "</a>")} />
        <Tool label={preview ? "Edit" : "Preview"} onClick={() => setPreview((on) => !on)} />
      </div>
      <input className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-base" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https:// link used by the Link button" inputMode="url" />
      {preview ? (
        <div className="cms-copy min-h-40 rounded-xl border border-line bg-paper p-3 text-base leading-relaxed [&_a]:text-primary [&_a]:underline [&_h2]:mt-3 [&_h2]:text-xl [&_h2]:font-extrabold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }} />
      ) : (
        <textarea ref={ref} className="min-h-56 w-full rounded-xl border border-line bg-paper px-3 py-3 text-base leading-relaxed" value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function Tool({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="shrink-0 rounded-full border border-line px-3 py-2 text-xs font-bold" onClick={onClick}>
      {label}
    </button>
  );
}

export function CmsHtml({ html }: { html: string }) {
  return <div className="cms-copy space-y-2 text-sm leading-relaxed [&_a]:text-primary [&_a]:underline [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-extrabold [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />;
}
