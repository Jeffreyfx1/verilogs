import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Glyph, glyph } from "@/components/icons";
import { when } from "@/lib/money";
import { useStore, useUser } from "@/lib/store";
import type { Note } from "@/lib/catalog";

function complaintId(href: string | undefined) {
  const match = /^\/(?:dashboard|admin)\/complaints\/([A-Za-z0-9_-]{4,48})$/.exec(href || "");
  return match?.[1] || "";
}

function NoteCard({ note, onOpen }: { note: Note; onOpen?: () => void }) {
  const body = (
    <>
      <p className="font-semibold">{note.title}</p>
      <p className="text-xs text-muted">{note.body}</p>
      <p className="text-xs text-muted">{when(note.createdAt)}</p>
    </>
  );
  const className = `block rounded-xl px-2 py-2 text-sm ${note.read ? "bg-paper" : "bg-[#E5F2F8]"}`;
  const id = complaintId(note.href);
  if (id && note.href?.startsWith("/admin/")) {
    return (
      <Link key={note.id} to="/admin/complaints/$id" params={{ id }} onClick={onOpen} className={className}>
        {body}
      </Link>
    );
  }
  if (id) {
    return (
      <Link key={note.id} to="/dashboard/complaints/$id" params={{ id }} onClick={onOpen} className={className}>
        {body}
      </Link>
    );
  }
  if (note.href === "/admin/orders") {
    return (
      <Link key={note.id} to="/admin/orders" onClick={onOpen} className={className}>
        {body}
      </Link>
    );
  }
  if (note.href === "/admin/customers") {
    return (
      <Link key={note.id} to="/admin/customers" onClick={onOpen} className={className}>
        {body}
      </Link>
    );
  }
  if (note.href === "/admin/complaints") {
    return (
      <Link key={note.id} to="/admin/complaints" onClick={onOpen} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <div key={note.id} className={className}>
      {body}
    </div>
  );
}

export function NoticeBell() {
  const notes = useStore((s) => s.notifications);
  const session = useStore((s) => s.sessionUserId);
  const mark = useStore((s) => s.markNotes);
  const me = useUser();
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = notes.map((note) => note.id);
    if (!seen.current) {
      seen.current = new Set(ids);
      return;
    }
    if (me?.role === "admin") {
      for (const note of notes) {
        if (seen.current.has(note.id) || note.read) continue;
        toast(note.title, { description: note.body });
      }
    }
    seen.current = new Set(ids);
  }, [notes, me?.role]);
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
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        onClick={() => {
          setOpen((v) => !v);
          if (unread) mark();
        }}
      >
        <Glyph icon={glyph.bell} className="size-4 text-[#5b4cdb]" />
        {unread ? <span className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span> : null}
      </button>
      {open ? (
        <div className="notice-pop absolute right-0 z-50 mt-2 rounded-card border border-line bg-card p-2 shadow-card">
          <p className="px-2 py-1 text-xs font-semibold text-muted">Notifications</p>
          <div className="note-list space-y-1 overflow-y-auto">
            {notes.slice(0, 12).map((note) => (
              <NoteCard key={note.id} note={note} onOpen={() => setOpen(false)} />
            ))}
            {!notes.length ? <p className="px-2 py-3 text-sm text-muted">{me?.role === "admin" ? "Complaints, purchases and new customers show up here." : "No notices yet. Wallet credits, orders and mail show up here."}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminNoticeList({ notes }: { notes: Note[] }) {
  if (!notes.length) return <p className="text-sm text-muted">No notifications yet. A complaint, a purchase or a new customer will show up here.</p>;
  return (
    <div className="space-y-2">
      {notes.slice(0, 8).map((note) => (
        <NoteCard key={note.id} note={note} />
      ))}
    </div>
  );
}