import { useEffect, useRef, useState } from "react";
import { Glyph, glyph } from "@/components/icons";
import { supportAsk, supportFeedback } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";
import { veraFrame, type VeraFrame } from "@/lib/vera-frame";

const QUICK = ["How do I buy a number?", "How do I fund my wallet?", "How do I make a purchase?", "How do I contact support?"];
const THREAD_KEY = "vl_vera_thread";

async function readVeraStream(question: string, threadId: string, onText: (full: string) => void) {
  let res: Response;
  try {
    res = await fetch("/api/vera/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      credentials: "same-origin",
      body: JSON.stringify({ question, threadId }),
    });
  } catch {
    return null;
  }
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !res.body || !type.includes("text/event-stream")) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  let nextThread = threadId;
  let failed = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() || "";
    for (const block of blocks) {
      let event = "message";
      let data = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;
      let payload: { text?: string; threadId?: string } = {};
      try {
        payload = JSON.parse(data) as { text?: string; threadId?: string };
      } catch {
        continue;
      }
      if (event === "delta" && payload.text) {
        text += payload.text;
        onText(text);
      } else if (event === "done") {
        if (payload.threadId) nextThread = payload.threadId;
        if (payload.text) text = payload.text;
      } else if (event === "error") failed = true;
    }
  }
  if (failed && !text) throw new Error("Vera stream failed");
  if (!text) return null;
  return { text, threadId: nextThread };
}

type Line = { from: "me" | "vera"; text: string; at: string };

function clock(iso: string) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function readFrame(): VeraFrame {
  const view = window.visualViewport;
  const nav = document.querySelector(".bottom-nav");
  const navBox = nav?.getBoundingClientRect();
  const navGap = navBox && navBox.height > 8 && getComputedStyle(nav as Element).display !== "none" ? Math.ceil(navBox.height) + 8 : 12;
  return veraFrame({
    layoutHeight: window.innerHeight,
    visibleHeight: view?.height ?? window.innerHeight,
    offsetTop: view?.offsetTop ?? 0,
    width: view?.width ?? window.innerWidth,
    navGap,
  });
}

function VeraFace({ size }: { size: "sm" | "md" }) {
  return (
    <span className={`vera-face vera-face-${size}`} aria-hidden="true">
      <img src="/vera.webp" alt="" width={512} height={512} />
    </span>
  );
}

export function SupportBot() {
  const settings = useStore((s) => s.settings);
  const addTicket = useStore((s) => s.addTicket);
  const user = useStore((s) => s.users.find((u) => u.id === s.sessionUserId) ?? null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const [threadId, setThreadId] = useState("");
  const threadRef = useRef("");
  const [rated, setRated] = useState("");
  const [comment, setComment] = useState("");
  const [log, setLog] = useState<Line[]>([]);
  const [frame, setFrame] = useState<VeraFrame | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);

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
    if (!open) return;
    const measure = () => setFrame(readFrame());
    measure();
    const view = window.visualViewport;
    view?.addEventListener("resize", measure);
    view?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      view?.removeEventListener("resize", measure);
      view?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [open]);

  useEffect(() => {
    const box = scroller.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [log, busy, live, open, frame?.keyboard, frame?.panelHeight]);

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
    setLive("");
    setBusy(true);
    try {
      const streamed = await readVeraStream(q, threadRef.current, (full) => setLive(full));
      if (streamed) {
        remember(streamed.threadId || "");
        setLive("");
        setLog((prev) => [...prev, { from: "vera", text: streamed.text, at: new Date().toISOString() }]);
      } else {
        const res = await supportAsk({ data: { question: q, threadId: threadRef.current } });
        remember(res.threadId || "");
        setLog((prev) => [...prev, { from: "vera", text: res.text, at: new Date().toISOString() }]);
      }
      if (/complaint|problem|not working|scam|charged/.test(q.toLowerCase()) && user) {
        await addTicket({ email: user.email, subject: "Chat complaint", body: q });
      }
    } catch {
      setLog((prev) => [...prev, { from: "vera", text: "I could not answer just now. Use the Telegram channel and a person will pick it up.", at: new Date().toISOString() }]);
    } finally {
      setLive("");
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

  const onFocus = () => {
    const settle = () => {
      setFrame(readFrame());
      const box = scroller.current;
      if (box) box.scrollTop = box.scrollHeight;
    };
    requestAnimationFrame(settle);
    window.setTimeout(settle, 280);
    window.setTimeout(settle, 640);
  };

  const panelStyle = frame
    ? { height: frame.panelHeight, maxHeight: frame.panelHeight, width: frame.phone ? "100%" : frame.panelWidth }
    : undefined;
  const dockStyle: { bottom?: number; left?: number; right?: number } | undefined = frame
    ? {
      ...(frame.phone || frame.keyboard ? { left: 8, right: 8 } : {}),
      ...(frame.dockBottom != null ? { bottom: frame.dockBottom } : {}),
    }
    : undefined;

  return (
    <div className={`support-dock${frame?.keyboard ? " is-keyboard" : ""}`} style={dockStyle}>
      {open ? (
        <div className="chat-panel" style={panelStyle}>
          <div className="vera-head">
            <VeraFace size="md" />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-extrabold leading-none">Vera <span className="vera-dot" aria-label="Online" /></p>
              <p className="mt-1 truncate text-[11px] text-white/75">Your Verilogs AI Assistant</p>
            </div>
            <button type="button" className="grid size-8 place-items-center rounded-lg" aria-label="Close chat" onClick={() => setOpen(false)}>
              <Glyph icon={glyph.close} className="size-4" />
            </button>
          </div>
          <div ref={scroller} className="vera-log">
            <div className="flex items-end gap-2">
              <VeraFace size="sm" />
              <div className="vera-bubble vera-bubble-vera">
                <p>{settings.supportWelcome}</p>
              </div>
            </div>
            {log.map((line, i) => (
              <div key={`${line.at}-${i}`} className={`flex items-end gap-2 ${line.from === "me" ? "justify-end" : ""}`}>
                {line.from === "vera" ? <VeraFace size="sm" /> : null}
                <div className={`vera-bubble ${line.from === "me" ? "vera-bubble-me" : "vera-bubble-vera"}`}>
                  <p className="whitespace-pre-wrap break-words">{line.text}</p>
                  <p className={`mt-1 text-[10px] ${line.from === "me" ? "text-white/70" : "text-slate-400"}`}>{clock(line.at)}</p>
                </div>
              </div>
            ))}
            {busy ? (
              <div className="flex items-end gap-2">
                <VeraFace size="sm" />
                <div className="vera-bubble vera-bubble-vera">
                  {live ? <p className="whitespace-pre-wrap break-words">{live}</p> : <p className="vera-typing flex gap-1" aria-hidden="true"><span /><span /><span /></p>}
                  <p className="mt-1 text-[10px] text-slate-400">{live ? "Vera is replying…" : "Vera is checking…"}</p>
                </div>
              </div>
            ) : null}
            {threadId && rated !== threadId && log.some((line) => line.from === "vera") && !busy ? (
              <div className="rounded-2xl bg-white px-2.5 py-2 shadow-sm">
                <p className="text-xs font-semibold">Was Vera helpful?</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="rounded-full border border-line px-3 py-1 text-xs font-bold" onClick={() => void rate("yes")}>Yes</button>
                  <button type="button" className="rounded-full border border-line px-3 py-1 text-xs font-bold" onClick={() => void rate("no")}>No</button>
                </div>
                <input className="vera-input mt-2 w-full rounded-lg border border-line bg-[#eef6fb] px-2 py-1.5" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional comment" />
              </div>
            ) : null}
          </div>
          <div className="vera-quick">
            {QUICK.map((q) => (
              <button key={q} type="button" className="vera-chip" onClick={() => void ask(q)}>{q}</button>
            ))}
          </div>
          <form
            className="vera-compose"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(text);
            }}
          >
            <input
              ref={field}
              className="vera-input min-w-0 flex-1 rounded-full border border-[#d5e7ef] bg-[#eef6fb] px-3 py-2"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={onFocus}
              placeholder="Message Vera…"
              enterKeyHint="send"
              autoComplete="off"
            />
            <button type="submit" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#0B6E8A] text-white" aria-label="Send">
              <Glyph icon={glyph.send} className="size-4" />
            </button>
          </form>
          <a href={settings.telegram} target="_blank" rel="noreferrer" className="vera-telegram">Open Telegram channel</a>
        </div>
      ) : null}
      <button type="button" className="vera-fab" aria-label={open ? "Close Vera" : "Open Vera"} onClick={() => setOpen((v) => !v)}>
        <span className="vera-fab-ring" aria-hidden="true" />
        {open ? <Glyph icon={glyph.close} className="size-5" /> : <img src="/vera.webp" alt="" width={512} height={512} />}
      </button>
    </div>
  );
}
