import { useEffect, useRef, useState } from "react";
import { Glyph, glyph } from "@/components/icons";
import { supportAsk, supportFeedback } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

const QUICK = ["How do I buy a number?", "How do I fund my wallet?", "Refund a waiting number", "Talk to a person"];
const THREAD_KEY = "vl_vera_thread";

export function SupportBot() {
  const settings = useStore((s) => s.settings);
  const addTicket = useStore((s) => s.addTicket);
  const user = useStore((s) => s.users.find((u) => u.id === s.sessionUserId) ?? null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState("");
  const threadRef = useRef("");
  const [rated, setRated] = useState("");
  const [comment, setComment] = useState("");
  const [log, setLog] = useState<{ from: "me" | "vera"; text: string }[]>([]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(THREAD_KEY) || "";
      threadRef.current = saved;
      setThreadId(saved);
    } catch {
      setThreadId("");
    }
  }, []);

  const remember = (id: string) => {
    if (!id) return;
    threadRef.current = id;
    setThreadId(id);
    try {
      sessionStorage.setItem(THREAD_KEY, id);
    } catch {
      /* private mode can block storage; the thread id still stays in memory */
    }
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setLog((prev) => [...prev, { from: "me", text: q }]);
    setText("");
    setBusy(true);
    try {
      const res = await supportAsk({ data: { question: q, threadId: threadRef.current } });
      remember(res.threadId || "");
      setLog((prev) => [...prev, { from: "vera", text: res.text }]);
      if (/complaint|problem|not working|scam|charged/.test(q.toLowerCase()) && user) {
        await addTicket({ email: user.email, subject: "Chat complaint", body: q });
      }
    } catch {
      setLog((prev) => [...prev, { from: "vera", text: "I could not answer just now. Use the Telegram channel and a person will pick it up." }]);
    } finally {
      setBusy(false);
    }
  };

  const rate = async (helpful: "yes" | "no") => {
    if (!threadRef.current || rated === threadRef.current) return;
    try {
      const res = await supportFeedback({ data: { threadId: threadRef.current, helpful, comment } });
      if (res.error) return;
      setRated(threadRef.current);
      setComment("");
    } catch {
      /* feedback is optional */
    }
  };

  return (
    <div className="support-dock">
      {open ? (
        <div className="chat-panel mb-3 flex flex-col overflow-hidden rounded-card border border-line bg-card shadow-card">
          <div className="flex items-center justify-between bg-deep px-3 py-3 text-on-deep">
            <div>
              <p className="text-sm font-bold">Vera</p>
              <p className="text-xs text-on-deep/70">Quick help · Telegram if you need a person</p>
            </div>
            <button type="button" className="rounded-lg p-1" aria-label="Close chat" onClick={() => setOpen(false)}>
              <Glyph icon={glyph.close} className="size-4" />
            </button>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto bg-paper p-3 text-sm">
            <p className="rounded-xl bg-card px-3 py-2">{settings.supportWelcome}</p>
            {log.map((line, i) => (
              <p key={i} className={`rounded-xl px-3 py-2 ${line.from === "me" ? "ml-6 bg-primary text-on-primary" : "mr-6 bg-card"}`}>
                {line.text}
              </p>
            ))}
            {busy ? <p className="text-xs text-muted">Vera is typing…</p> : null}
            {threadId && rated !== threadId && log.some((line) => line.from === "vera") && !busy ? (
              <div className="rounded-xl bg-card px-3 py-2">
                <p className="text-xs font-semibold">Was Vera helpful?</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="rounded-full border border-line px-3 py-1 text-xs font-bold" onClick={() => void rate("yes")}>Yes</button>
                  <button type="button" className="rounded-full border border-line px-3 py-1 text-xs font-bold" onClick={() => void rate("no")}>No</button>
                </div>
                <input className="mt-2 w-full rounded-lg border border-line bg-paper px-2 py-2 text-base" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment" />
              </div>
            ) : null}
          </div>
          <div className="flex gap-1 overflow-x-auto border-t border-line px-2 py-2">
            {QUICK.map((q) => (
              <button key={q} type="button" className="shrink-0 rounded-full border border-line px-2 py-1 text-xs" onClick={() => void ask(q)}>
                {q}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2 border-t border-line p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
          >
            <input className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask or describe a problem" />
            <button type="submit" className="rounded-xl bg-primary px-3 text-sm font-semibold text-on-primary">
              Send
            </button>
          </form>
          <a href={settings.telegram} target="_blank" rel="noreferrer" className="border-t border-line px-3 py-2 text-center text-xs font-semibold text-primary">
            Open Telegram channel
          </a>
        </div>
      ) : null}
      <button type="button" className="ml-auto grid size-14 place-items-center rounded-full bg-deep text-on-deep shadow-card" aria-label="Open support chat" onClick={() => setOpen((v) => !v)}>
        {open ? <Glyph icon={glyph.close} className="size-5" /> : <Glyph icon={glyph.chat} className="size-5" />}
      </button>
    </div>
  );
}
