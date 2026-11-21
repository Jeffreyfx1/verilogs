import { useEffect, useRef, useState } from "react";
import { Glyph, glyph } from "@/components/icons";
import { supportAsk, supportFeedback } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

const QUICK = ["How do I buy a number?", "How do I fund my wallet?", "Refund a waiting number", "Talk to a person"];
const THREAD_KEY = "vl_vera_thread";

type Line = { from: "me" | "vera"; text: string; at: string };

function clock(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

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
  const [log, setLog] = useState<Line[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(THREAD_KEY) || "";
      threadRef.current = saved;
      setThreadId(saved);
    } catch {
      setThreadId("");
    }
  }, []);

  useEffect(() => {
    const box = scroller.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [log, busy, open]);

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
    setLog((prev) => [...prev, { from: "me", text: q, at: new Date().toISOString() }]);
    setText("");
    setBusy(true);
    try {
      const res = await supportAsk({ data: { question: q, threadId: threadRef.current } });
      remember(res.threadId || "");
      setLog((prev) => [...prev, { from: "vera", text: res.text, at: new Date().toISOString() }]);
      if (/complaint|problem|not working|scam|charged/.test(q.toLowerCase()) && user) {
        await addTicket({ email: user.email, subject: "Chat complaint", body: q });
      }
    } catch {
      setLog((prev) => [...prev, { from: "vera", text: "I could not answer just now. Use the Telegram channel and a person will pick it up.", at: new Date().toISOString() }]);
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
        <div className="chat-panel mb-3 flex flex-col overflow-hidden rounded-[1.4rem] border border-[#d5e7ef] bg-white shadow-[0_16px_40px_rgba(8,50,74,0.18)]">
          <div className="flex items-center gap-3 bg-[#08324A] px-3 py-3 text-white">
            <span className="vera-avatar" aria-hidden="true">V</span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-extrabold">Vera <span className="vera-dot" aria-label="Online" /></p>
              <p className="text-xs text-white/75">Your Verilogs AI Assistant</p>
            </div>
            <button type="button" className="rounded-lg p-1" aria-label="Close chat" onClick={() => setOpen(false)}>
              <Glyph icon={glyph.close} className="size-4" />
            </button>
          </div>
          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto bg-[#eef6fb] p-3 text-sm">
            <div className="flex items-end gap-2">
              <span className="vera-avatar" aria-hidden="true">V</span>
              <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-white px-3 py-2 shadow-sm">
                <p>{settings.supportWelcome}</p>
              </div>
            </div>
            {log.map((line, i) => (
              <div key={`${line.at}-${i}`} className={`flex items-end gap-2 ${line.from === "me" ? "justify-end" : ""}`}>
                {line.from === "vera" ? <span className="vera-avatar" aria-hidden="true">V</span> : null}
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${line.from === "me" ? "rounded-br-md bg-[#0B6E8A] text-white" : "rounded-bl-md bg-white shadow-sm"}`}>
                  <p className="whitespace-pre-wrap break-words">{line.text}</p>
                  <p className={`mt-1 text-[10px] ${line.from === "me" ? "text-white/70" : "text-slate-400"}`}>{clock(line.at)}</p>
                </div>
              </div>
            ))}
            {busy ? (
              <div className="flex items-end gap-2">
                <span className="vera-avatar" aria-hidden="true">V</span>
                <div className="rounded-2xl rounded-bl-md bg-white px-3 py-2 shadow-sm">
                  <p className="vera-typing flex gap-1" aria-hidden="true"><span /><span /><span /></p>
                  <p className="mt-1 text-[10px] text-slate-400">Vera is typing…</p>
                </div>
              </div>
            ) : null}
            {threadId && rated !== threadId && log.some((line) => line.from === "vera") && !busy ? (
              <div className="rounded-2xl bg-white px-3 py-2 shadow-sm">
                <p className="text-xs font-semibold">Was Vera helpful?</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="rounded-full border border-line px-3 py-1 text-xs font-bold" onClick={() => void rate("yes")}>Yes</button>
                  <button type="button" className="rounded-full border border-line px-3 py-1 text-xs font-bold" onClick={() => void rate("no")}>No</button>
                </div>
                <input className="mt-2 w-full rounded-lg border border-line bg-[#eef6fb] px-2 py-2 text-base" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment" />
              </div>
            ) : null}
          </div>
          <div className="flex gap-1 overflow-x-auto border-t border-[#d5e7ef] bg-white px-2 py-2">
            {QUICK.map((q) => (
              <button key={q} type="button" className="shrink-0 rounded-full border border-[#d5e7ef] bg-[#eef6fb] px-2 py-1 text-xs font-semibold" onClick={() => void ask(q)}>
                {q}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2 border-t border-[#d5e7ef] bg-white p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
          >
            <input className="min-w-0 flex-1 rounded-full border border-[#d5e7ef] bg-[#eef6fb] px-4 py-3 text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message Vera…" enterKeyHint="send" />
            <button type="submit" className="grid size-11 place-items-center rounded-full bg-[#0B6E8A] text-white" aria-label="Send">
              <Glyph icon={glyph.send} className="size-4" />
            </button>
          </form>
          <a href={settings.telegram} target="_blank" rel="noreferrer" className="border-t border-[#d5e7ef] bg-white px-3 py-2 text-center text-xs font-semibold text-[#0B6E8A]">
            Open Telegram channel
          </a>
        </div>
      ) : null}
      <button type="button" className="vera-fab ml-auto" aria-label={open ? "Close Vera" : "Open Vera"} onClick={() => setOpen((v) => !v)}>
        <span className="vera-fab-ring" aria-hidden="true" />
        {open ? <Glyph icon={glyph.close} className="size-5" /> : <span className="text-lg font-extrabold">V</span>}
      </button>
    </div>
  );
}
