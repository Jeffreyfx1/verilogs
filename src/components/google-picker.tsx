import { useEffect, useState } from "react";
import { hostStatus } from "@/lib/shop-fns";

export function GooglePicker() {
  const [ready, setReady] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    hostStatus()
      .then((s) => setReady(s.google))
      .catch(() => setReady(false));
  }, []);
  if (ready) {
    return (
      <a href="/api/google/start" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold">
        <span className="grid size-5 place-items-center rounded-full bg-paper text-xs font-bold text-primary">G</span>
        Continue with Google
      </a>
    );
  }
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-card px-4 py-2.5 text-sm font-semibold">
        <span className="grid size-5 place-items-center rounded-full bg-paper text-xs font-bold text-primary">G</span>
        Continue with Google
      </button>
      {open ? (
        <ol className="mt-3 list-decimal space-y-2 rounded-xl border border-line bg-paper p-3 pl-8 text-xs leading-relaxed text-muted">
          <li>In Google Cloud, create an OAuth client of type Web application.</li>
          <li>Add origin https://veri-logs.com and redirect https://veri-logs.com/api/google/callback.</li>
          <li>On Render, set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_URL=https://veri-logs.com.</li>
          <li>Until those are set, sign up with email. Resend is only for notification mail, not for Google login.</li>
        </ol>
      ) : null}
    </div>
  );
}
