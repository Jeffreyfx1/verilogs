import { createFileRoute } from "@tanstack/react-router";
import { PublicFrame } from "@/components/chrome";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/community")({ component: CommunityPage });

function CommunityPage() {
  const settings = useStore((s) => s.settings);
  return (
    <PublicFrame>
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-3xl font-extrabold">{settings.community}</h1>
        <p className="mt-2 text-sm text-muted">Delivery tips, outages and new servers are posted with the community, not inside the buy screen.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <a href={settings.telegram} className="rounded-card border border-line bg-card p-5 shadow-card" target="_blank" rel="noreferrer">
            <p className="font-bold">Telegram</p>
            <p className="mt-1 text-sm text-muted">Join the channel</p>
          </a>
          <a href={settings.whatsapp} className="rounded-card border border-line bg-card p-5 shadow-card" target="_blank" rel="noreferrer">
            <p className="font-bold">WhatsApp</p>
            <p className="mt-1 text-sm text-muted">Message support</p>
          </a>
        </div>
      </div>
    </PublicFrame>
  );
}
