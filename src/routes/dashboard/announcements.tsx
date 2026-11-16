import { createFileRoute } from "@tanstack/react-router";
import { liveAnnouncements } from "@/lib/catalog";
import { when } from "@/lib/money";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/dashboard/announcements")({ component: AnnouncementsPage });

function AnnouncementsPage() {
  const items = liveAnnouncements(useStore((s) => s.announcements));
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-2xl font-extrabold">Announcements</h1>
      <p className="text-sm text-muted">The same posts that scroll across the top of the site.</p>
      {items.map((a) => (
        <article key={a.id} className="rounded-card border border-line bg-card p-4 shadow-card">
          <h2 className="font-bold">{a.title}</h2>
          {a.body ? <p className="mt-1 text-sm text-muted">{a.body}</p> : null}
          <p className="mt-2 text-xs text-muted">{when(a.createdAt)}</p>
        </article>
      ))}
      {!items.length ? <p className="rounded-card border border-line bg-card p-4 text-sm text-muted">No announcements right now.</p> : null}
    </div>
  );
}