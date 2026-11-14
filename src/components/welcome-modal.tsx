import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Send, X } from "lucide-react";
import { Logo } from "@/components/ui";
import { useStore, useUser } from "@/lib/store";

export function WelcomeModal() {
  const popup = useStore((s) => s.settings.popup);
  const whatsapp = useStore((s) => s.settings.whatsapp);
  const telegram = useStore((s) => s.settings.telegram);
  const user = useUser();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!popup?.enabled) return;
    try {
      if (sessionStorage.getItem("verilogs-welcome") === "1") return;
    } catch {
      /* private mode */
    }
    setOpen(true);
  }, [popup?.enabled]);

  if (!open || !popup?.enabled) return null;

  const close = () => {
    try {
      sessionStorage.setItem("verilogs-welcome", "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-deep/50 px-4" role="dialog" aria-modal="true" aria-label={popup.title}>
      <div className="w-full max-w-md overflow-hidden rounded-[1.6rem] bg-card shadow-card">
        <div className="promo-card relative rounded-none">
          <button type="button" onClick={close} className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/15 text-white" aria-label="Close">
            <X className="size-4" />
          </button>
          <div className="inline-flex rounded-2xl bg-white/15 px-3 py-2">
            <Logo compact />
          </div>
          <h2 className="mt-4 text-2xl font-extrabold text-white">{popup.title}</h2>
          <p className="mt-2 text-sm font-medium leading-relaxed text-white/80">{popup.body}</p>
        </div>
        <div className="space-y-3 p-4">
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noreferrer" className="flex gap-3 rounded-2xl bg-paper p-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#1f8f4e] text-white">
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
                  <path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.41a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2zm5.76 14.04c-.24.68-1.4 1.3-1.94 1.38-.5.08-1.12.11-1.81-.11-.41-.14-.95-.31-1.63-.61-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.15-1.53-1.15-2.92s.73-2.07 1-2.35c.24-.28.64-.41 1.02-.41h.73c.23 0 .55-.09.86.66.32.77 1.08 2.66 1.18 2.85.1.19.16.42.03.67-.13.26-.2.42-.39.64-.19.23-.4.51-.57.68-.19.19-.39.4-.17.77.23.38 1 1.65 2.15 2.67 1.48 1.32 2.72 1.73 3.1 1.92.38.19.6.16.82-.1.23-.26.92-1.07 1.17-1.44.24-.36.49-.3.82-.18.34.13 2.13 1 2.49 1.18.36.19.6.28.69.43.08.16.08.9-.16 1.58z" />
                </svg>
              </span>
              <span>
                <span className="block font-extrabold">{popup.whatsappTitle}</span>
                <span className="mt-0.5 block text-sm font-medium text-muted">{popup.whatsappBody}</span>
                <span className="mt-1 block text-sm font-extrabold text-[#1f8f4e]">Join community now</span>
              </span>
            </a>
          ) : null}
          {telegram ? (
            <a href={telegram} target="_blank" rel="noreferrer" className="flex gap-3 rounded-2xl bg-paper p-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary text-on-primary">
                <Send className="size-5" />
              </span>
              <span>
                <span className="block font-extrabold">{popup.telegramTitle}</span>
                <span className="mt-0.5 block text-sm font-medium text-muted">{popup.telegramBody}</span>
                <span className="mt-1 block text-sm font-extrabold text-primary">Open Telegram</span>
              </span>
            </a>
          ) : null}
          <Link to={user ? "/dashboard/numbers" : "/register"} onClick={close} className="btn-gradient flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold">
            {popup.button}
          </Link>
        </div>
      </div>
    </div>
  );
}
