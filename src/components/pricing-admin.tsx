import { useState } from "react";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { naira } from "@/lib/money";
import { useStore } from "@/lib/store";

export function PricingAdmin() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const [general, setGeneral] = useState(settings.generalProfit ?? 1500);
  const [airtime, setAirtime] = useState(settings.airtimeProfit ?? 300);
  const [data, setData] = useState(settings.dataProfit ?? 300);
  const [busy, setBusy] = useState(false);

  const save = async (patch: { generalProfit?: number; airtimeProfit?: number; dataProfit?: number }, label: string) => {
    setBusy(true);
    const err = await saveSettings(patch);
    setBusy(false);
    if (err) toast.error(err);
    else toast.success(`${label} saved`);
  };

  return (
    <section className="rounded-card border border-line bg-card p-4 shadow-card">
      <h2 className="font-extrabold">Product pricing settings</h2>
      <p className="mt-1 text-sm text-muted">Customer price is the provider cost in naira plus one fixed profit per completed order. Airtime and data never use the general profit.</p>
      <div className="mt-4 grid gap-4">
        <div>
          <Field label="General product profit (₦)" hint="Logs, SMM, USA services and number servers. Added once per order, not once per unit.">
            <input className={inputClass} inputMode="numeric" value={general} onChange={(e) => setGeneral(Number(e.target.value))} />
          </Field>
          <Button className="mt-2" tone="soft" busy={busy} onClick={() => void save({ generalProfit: general }, "General profit")}>Save general profit</Button>
        </div>
        <div>
          <Field label="Airtime profit (₦)" hint="Added to the airtime amount. Changing this does not change data.">
            <input className={inputClass} inputMode="numeric" value={airtime} onChange={(e) => setAirtime(Number(e.target.value))} />
          </Field>
          <Button className="mt-2" tone="soft" busy={busy} onClick={() => void save({ airtimeProfit: airtime }, "Airtime profit")}>Save airtime profit</Button>
        </div>
        <div>
          <Field label="Data profit (₦)" hint="Added to the data plan cost. Changing this does not change airtime.">
            <input className={inputClass} inputMode="numeric" value={data} onChange={(e) => setData(Number(e.target.value))} />
          </Field>
          <Button className="mt-2" tone="soft" busy={busy} onClick={() => void save({ dataProfit: data }, "Data profit")}>Save data profit</Button>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">Defaults are {naira(1500)} general, {naira(300)} airtime and {naira(300)} data. A past order keeps the price the customer paid.</p>
    </section>
  );
}
