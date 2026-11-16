import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { quoteProduct } from "@/lib/catalog";
import { naira } from "@/lib/money";
import { customerPrice, pricingOf, successRateOf, type MarginTier, type PricingSettings } from "@/lib/pricing";
import { useStore } from "@/lib/store";

export function PricingAdmin() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const products = useStore((s) => s.products);
  const providers = useStore((s) => s.providers);
  const [pricing, setPricing] = useState<PricingSettings>(() => pricingOf(settings.pricing));
  const [defaultPercent, setDefaultPercent] = useState(settings.margin ?? 12);
  const [cost, setCost] = useState("1000");
  const [rate, setRate] = useState("96");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [usdRate, setUsdRate] = useState(settings.usdNgn || 1343);

  const preview = useMemo(() => customerPrice({
    cost: Number(cost) || 0,
    currency,
    usdRate: Number(usdRate) || 0,
    successRate: rate.trim() === "" ? null : successRateOf(rate),
    pricing,
    defaultPercent: Number(defaultPercent) || 0,
  }), [cost, currency, defaultPercent, pricing, rate, usdRate]);

  const sample = products.slice(0, 12).map((product) => {
    const quoted = quoteProduct(product, { providers, settings: { ...settings, margin: Number(defaultPercent) || 0, pricing } });
    const provider = providers.find((item) => item.id === product.providerId);
    return { product, quoted, provider };
  });

  const editTier = (id: string, patch: Partial<MarginTier>) => {
    setPricing({ ...pricing, tiers: pricing.tiers.map((tier) => tier.id === id ? { ...tier, ...patch } : tier) });
  };

  const save = async () => {
    const err = await saveSettings({ margin: Number(defaultPercent) || 0, pricing });
    if (err) toast.error(err);
    else toast.success("Pricing saved. Checkout uses this formula.");
  };

  return (
    <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
      <div>
        <h2 className="font-extrabold">Pricing</h2>
        <p className="mt-1 text-sm text-muted">Selling price = provider price in naira × (1 + markup ÷ 100). A missing success rate uses the default percent, never the 95% tier.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="Default markup %"><input className={inputClass} inputMode="decimal" value={defaultPercent} onChange={(e) => setDefaultPercent(Number(e.target.value))} /></Field>
        <Field label="Round to">
          <select className={inputClass} value={pricing.roundTo} onChange={(e) => setPricing({ ...pricing, roundTo: Number(e.target.value) })}>
            <option value={1}>₦1</option>
            <option value={5}>₦5</option>
            <option value={10}>₦10</option>
          </select>
        </Field>
        <label className="mt-6 flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={pricing.auto} onChange={(e) => setPricing({ ...pricing, auto: e.target.checked })} />
          Use success-rate tiers
        </label>
      </div>
      <div className="space-y-2">
        {pricing.tiers.map((tier) => (
          <div key={tier.id} className="grid grid-cols-4 gap-2">
            <input className={inputClass} inputMode="decimal" value={tier.minRate} onChange={(e) => editTier(tier.id, { minRate: Number(e.target.value) })} />
            <input className={inputClass} inputMode="decimal" value={tier.maxRate} onChange={(e) => editTier(tier.id, { maxRate: Number(e.target.value) })} />
            <input className={inputClass} inputMode="decimal" value={tier.markupPercent} onChange={(e) => editTier(tier.id, { markupPercent: Number(e.target.value) })} />
            <input className={inputClass} inputMode="decimal" value={tier.minProfit} onChange={(e) => editTier(tier.id, { minProfit: Number(e.target.value) })} />
          </div>
        ))}
        <p className="text-[11px] text-muted">Columns: minimum success %, maximum success %, markup %, minimum profit in naira.</p>
        <Button tone="soft" onClick={() => setPricing({ ...pricing, tiers: [...pricing.tiers, { id: `tier-${Date.now()}`, minRate: 0, maxRate: 100, markupPercent: 15, minProfit: 0, enabled: true, providerId: "", service: "" }] })}>Add a tier</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        <Field label="Preview provider price"><input className={inputClass} value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
        <Field label="Success rate %"><input className={inputClass} value={rate} placeholder="blank if missing" onChange={(e) => setRate(e.target.value)} /></Field>
        <Field label="Currency">
          <select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value as "NGN" | "USD")}>
            <option value="NGN">NGN</option>
            <option value="USD">USD</option>
          </select>
        </Field>
        <Field label="Naira per $1"><input className={inputClass} value={usdRate} onChange={(e) => setUsdRate(Number(e.target.value))} /></Field>
      </div>
      <p className="text-sm font-semibold">
        Customer price {naira(preview.price)} · markup {preview.percent}% · profit {naira(Math.round(preview.profit))} · {preview.reason}{preview.tierId ? ` · ${preview.tierId}` : ""}
      </p>
      {sample.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted">
                <th className="py-1 pr-2">Service</th>
                <th className="py-1 pr-2">Server</th>
                <th className="py-1 pr-2">Cost</th>
                <th className="py-1 pr-2">Rate</th>
                <th className="py-1">Selling</th>
              </tr>
            </thead>
            <tbody>
              {sample.map(({ product, quoted, provider }) => (
                <tr key={product.id}>
                  <td className="py-1 pr-2">{product.service || product.name}</td>
                  <td className="py-1 pr-2">{provider?.serverId || provider?.name || "—"}</td>
                  <td className="py-1 pr-2">{product.cost}</td>
                  <td className="py-1 pr-2">{product.rate == null || product.rate < 0 ? "—" : `${product.rate}%`}</td>
                  <td className="py-1">{naira(quoted.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="text-sm text-muted">No imported products yet. The preview above still uses the saved tiers.</p>}
      <Button onClick={() => void save()}>Save pricing</Button>
    </section>
  );
}
