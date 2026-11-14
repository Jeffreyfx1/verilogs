import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { hostStatus } from "@/lib/shop-fns";

export const Route = createFileRoute("/admin/hosting")({ component: HostingPage });

function Row({ on, title, body }: { on: boolean; title: string; body: string }) {
  return (
    <article className="rounded-card border border-line bg-card p-4 shadow-card">
      <p className="text-xs font-semibold text-muted">{on ? "Connected" : "Not connected"}</p>
      <h2 className="mt-1 text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
    </article>
  );
}

function HostingPage() {
  const [status, setStatus] = useState({ paystack: false, resend: false, google: false, ai: false, appUrl: "" });
  useEffect(() => {
    hostStatus().then(setStatus).catch(() => undefined);
  }, []);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Connections</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Keys stay on the host. This page only shows whether each one is set.</p>
      </div>
      <Row on={status.paystack} title="Paystack" body={status.paystack ? "Wallet top-ups are charged through Paystack." : "Wallet top-ups are off until the Paystack key is set on the host."} />
      <Row on={status.resend} title="Email" body={status.resend ? "Account and wallet messages are emailed." : "Email is off. Customers still get notices inside the app."} />
      <Row on={status.google} title="Google sign-in" body={status.google ? "Customers can continue with Google." : "Google sign-in is off. Email and password still work."} />
      <Row on={!!status.appUrl} title="Public address" body={status.appUrl ? status.appUrl : "The public address is not set on the host."} />
      <Row on={status.ai} title="Support chat" body="Vera answers from your FAQs. Signed-in complaints are saved as tickets."} />
    </div>
  );
}
