import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { when } from "@/lib/money";
import { useStore } from "@/lib/store";

export function NoticeBell() {
  const notes = useStore((s) => s.notifications);
  const session = useStore((s) => s.sessionUserId);
  const mark = useStore((s) => s.markNotes);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      const node = event.target;
      const box = node instanceof Element ? node : node instanceof Node ? node.parentElement : null;
      if (box?.closest(".notice-pop")) return;
      setOpen(false);
    };
    const scroller = document.querySelector(".app-pad");
    scroller?.addEventListener("scroll", close, { passive: true });
    scroller?.addEventListener("touchmove", close, { passive: true });
    window.addEventListener("wheel", close, { passive: true });
    return () => {
      scroller?.removeEventListener("scroll", close);
      scroller?.removeEventListener("touchmove", close);
      window.removeEventListener("wheel", close);
    };
  }, [open]);
  if (!session) return null;
  const unread = notes.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button
        type="button"
        className="relative rounded-xl border border-line p-2"
        aria-label="Notifications"
        onClick={() => {
          setOpen((v) => !v);
          if (unread) mark();
        }}
      >
        <Bell className="size-4" />
        {unread ? <span className="absolute right-1 top-1 size-2 rounded-full bg-danger" /> : null}
      </button>
      {open ? (
        <div className="notice-pop absolute right-0 z-50 mt-2 rounded-card border border-line bg-card p-2 shadow-card">
          <p className="px-2 py-1 text-xs font-semibold text-muted">Notifications</p>
          <div className="note-list space-y-1 overflow-y-auto">
            {notes.slice(0, 12).map((n) => (
              <div key={n.id} className="rounded-xl bg-paper px-2 py-2 text-sm">
                <p className="font-semibold">{n.title}</p>
                <p className="text-xs text-muted">{n.body}</p>
                <p className="text-xs text-muted">{when(n.createdAt)}</p>
              </div>
            ))}
            {!notes.length ? <p className="px-2 py-3 text-sm text-muted">No notices yet. Wallet credits, orders and mail show up here.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}