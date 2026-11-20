import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/airtime")({ component: AirtimePage });

function AirtimePage() {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-6">
      <section className="rounded-[1.6rem] border border-amber-200 bg-amber-50 p-6 text-ink shadow-card">
        <p className="inline-flex rounded-full bg-amber-500 px-3 py-1 text-[11px] font-extrabold tracking-[0.14em] text-white">COMING SOON</p>
        <h1 className="mt-3 text-3xl font-extrabold">Airtime</h1>
        <p className="mt-2 text-sm text-slate-700">Airtime is not for sale yet. No recharge can be started from this page, and nothing is sent to a provider.</p>
      </section>
      <Link to="/dashboard" className="inline-block text-sm font-bold text-primary">Back to dashboard</Link>
    </div>
  );
}
