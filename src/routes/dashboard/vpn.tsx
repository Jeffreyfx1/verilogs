import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/vpn")({
  component: function VpnPage() {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-6">
        <section className="rounded-[1.6rem] bg-gradient-to-br from-[#174C70] to-[#286D86] p-6 text-white shadow-card">
          <p className="text-[11px] font-bold tracking-[0.14em] text-white/75">VPN</p>
          <h1 className="mt-1 text-3xl font-extrabold">Coming soon</h1>
          <p className="mt-2 text-sm text-white/85">VPN is not for sale yet. Nothing is imported into this page, and other products are not filed here.</p>
        </section>
        <Link to="/dashboard" className="inline-block text-sm font-bold text-primary">Back to dashboard</Link>
      </div>
    );
  },
});
