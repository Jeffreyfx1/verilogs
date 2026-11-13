import { createFileRoute } from "@tanstack/react-router";
import { when } from "@/lib/money";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/dashboard/announcements")({ component: AnnouncementsPage });

function AnnouncementsPage() {
  const items = useStore((s) => s.announcements);
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-2xl font-extrabold">Announcements</h1>
      {items.map((a) => (
        <article key={a.id} className="rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="font-bold">{a.title}</h2>
          <p className="mt-1 text-sm text-muted">{a.body}</p>
          <p className="mt-2 text-xs text-muted">{when(a.createdAt)}</p>
        </article>
      ))}
    </div>
  );
}
