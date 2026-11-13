import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { hostStatus } from "@/lib/shop-fns";

export const Route = createFileRoute("/admin/hosting")({ component: HostingPage });

function Row({ on, title, body }: { on: boolean; title: string; body: string }) {
  return (
    <article className="rounded-card border border-line bg-card p-4 shadow-card">
      <p className="text-xs font-semibold text-muted">{on ? "Connected" : "Not connected yet"}</p>
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
        <h1 className="text-2xl font-extrabold">Hosting, Paystack, mail and Google</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Secrets stay on the host. This page never asks you to paste a secret key into the browser. The shop, wallets and catalogue already live in the database, so every visitor sees the same services.
        </p>
      </div>
      <Row
        on={status.paystack}
        title="Paystack"
        body="In the Paystack dashboard, open Settings, then API Keys & Webhooks. On Render set PAYSTACK_SECRET_KEY to your secret key. Set the webhook URL to https://veri-logs.com/api/paystack/webhook. Customers return to Fund wallet after payment, and the balance updates only when Paystack says the charge succeeded."
      />
      <Row
        on={status.resend}
        title="Resend mail"
        body="Resend sends the messages, including to Gmail addresses. Verify veri-logs.com in Resend, add the DNS records it shows into Cloudflare, then set RESEND_API_KEY and RESEND_FROM=VeriLogs <notifications@veri-logs.com>. Signup, wallet credit, password changes and admin messages create an in-app notice either way, and an email when this is connected."
      />
      <Row
        on={status.google}
        title="Google sign-up"
        body="Google Cloud Console, APIs & Services, Credentials, Create OAuth client ID, Web application. Authorised origin https://veri-logs.com. Authorised redirect https://veri-logs.com/api/google/callback. On Render set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_URL=https://veri-logs.com. The first time someone uses Google they still confirm name, phone and terms. This is separate from Resend."
      />
      <Row
        on={!!status.appUrl}
        title="Cloudflare and veri-logs.com"
        body="In Cloudflare DNS, point veri-logs.com at the Render service (CNAME to the onrender.com host Render gives you, proxy on). SSL mode Full. APP_URL must be https://veri-logs.com so Paystack and Google send people back to the right place."
      />
      <Row
        on={false}
        title="Render Pro"
        body="Create a Render Postgres database and a web service from this project. Build command: npm install && NITRO_PRESET=node-server npm run build. Start command: node .output/server/index.mjs. Environment: DATABASE_URL from the Render database, NODE_VERSION 22, NITRO_PRESET=node-server, plus the Paystack, Resend and Google variables above. The starter admin is admin@verilogs.app. Change that password from Profile after the first login. A render.yaml in the project lists the same service."
      />
      <Row
        on={status.ai}
        title="Support chat"
        body="Vera sits at the bottom of every page. She answers from your FAQs immediately. When the host has an xAI key she can answer in a fuller sentence. Complaints from a signed-in customer are also saved as support tickets, and the Telegram link is the human channel."
      />
    </div>
  );
}
