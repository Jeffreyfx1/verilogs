import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { naira } from "@/lib/money";
import { referralDesk } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/referrals")({ component: ReferralAdmin });

function ReferralAdmin() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const [enabled, setEnabled] = useState(settings.referralEnabled !== false);
  const [reward, setReward] = useState(settings.referralReward ?? 100);
  const [minimum, setMinimum] = useState(settings.referralMinPurchase ?? 0);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof referralDesk>> | null>(null);
  useEffect(() => {
    referralDesk().then(setStats).catch(() => toast.error("Could not load referral stats."));
  }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold">Referral management</h1>
      <p className="text-sm text-muted">A referrer is paid once, after the invited customer’s first completed purchase, and only when that order’s profit covers the reward.</p>
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Referrers", String(stats?.referrers || 0)],
          ["Referred customers", String(stats?.referred || 0)],
          ["Successful", String(stats?.successful || 0)],
          ["Pending", String(stats?.pending || 0)],
          ["Rewards credited", naira(stats?.credited || 0)],
          ["Rewards reversed", naira(stats?.reversed || 0)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-card border border-line bg-card p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="text-xl font-extrabold">{value}</p>
          </div>
        ))}
      </section>
      {stats?.flagged ? <p className="text-sm text-danger">{stats.flagged} rewards could not be reversed and are flagged.</p> : null}
      <section className="space-y-3 rounded-card border border-line bg-card p-4">
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Programme enabled</label>
        <Field label="Referral reward (₦)" hint="Default ₦100. Paid once per referred customer."><input className={inputClass} inputMode="numeric" value={reward} onChange={(e) => setReward(Number(e.target.value))} /></Field>
        <Field label="Minimum qualifying purchase (₦)" hint="The completed order must also earn enough profit to cover the reward."><input className={inputClass} inputMode="numeric" value={minimum} onChange={(e) => setMinimum(Number(e.target.value))} /></Field>
        <Button onClick={() => void saveSettings({ referralEnabled: enabled, referralReward: reward, referralMinPurchase: minimum }).then((err) => err ? toast.error(err) : toast.success("Referral settings saved"))}>Save referral settings</Button>
      </section>
    </div>
  );
}
