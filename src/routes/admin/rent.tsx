import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { importRentCountries, importRentServices, rentDesk, rentVariantRows, saveRentLabel, saveRentPricing, searchRentCatalogue } from "@/lib/shop-fns";
import { naira, when } from "@/lib/money";
import { effectiveRentRate } from "@/lib/rent";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/rent")({ component: RentAdmin });

type Desk = Awaited<ReturnType<typeof rentDesk>>;

function RentAdmin() {
  const allOrders = useStore((s) => s.orders);
  const orders = useMemo(() => allOrders.filter((order) => order.server === "Rent number"), [allOrders]);
  const users = useStore((s) => s.users);
  const [desk, setDesk] = useState<Desk | null>(null);
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");
  const [rate, setRate] = useState("");
  const [margin, setMargin] = useState("");
  const [marginOn, setMarginOn] = useState(false);
  const [priced, setPriced] = useState(false);
  const [nameQ, setNameQ] = useState("");
  const [names, setNames] = useState<{ service: string; label: string; variants: number }[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [variantCountry, setVariantCountry] = useState("");
  const [variantService, setVariantService] = useState("");
  const [variants, setVariants] = useState<Awaited<ReturnType<typeof rentVariantRows>> | null>(null);

  const load = () => {
    rentDesk().then(setDesk).catch(() => toast.error("Could not load Rent numbers."));
  };

  useEffect(load, []);

  useEffect(() => {
    if (!desk || priced) return;
    setRate(desk.pricing.usdNgn ? String(desk.pricing.usdNgn) : "");
    setMargin(desk.pricing.marginPerUsd ? String(desk.pricing.marginPerUsd) : "");
    setMarginOn(desk.pricing.marginEnabled);
    setPriced(true);
  }, [desk, priced]);

  const draftPricing = { usdNgn: Number(rate) || 0, marginPerUsd: Number(margin) || 0, marginEnabled: marginOn };
  const effective = effectiveRentRate(draftPricing);

  const activation = (desk?.countries || []).reduce((sum, row) => sum + row.activation, 0);
  const hosting = (desk?.countries || []).reduce((sum, row) => sum + row.hosting, 0);

  const importCountries = async () => {
    setBusy("countries");
    try {
      const result = await importRentCountries();
      if (result.error) toast.error(result.error);
      else toast.success(`Countries: ${result.imported} new, ${result.updated} updated.`);
      load();
    } catch {
      toast.error("Could not import countries.");
    } finally {
      setBusy("");
    }
  };

  const importOne = async (slug: string) => {
    setBusy(slug || "services");
    try {
      const result = await importRentServices({ data: { country: slug } });
      if (result.error) toast.error(result.error);
      else toast.success(`${slug}: ${result.imported} new, ${result.updated} updated, ${result.skipped} skipped.`);
      load();
    } catch {
      toast.error("Could not import services.");
    } finally {
      setBusy("");
    }
  };

  const importAll = async () => {
    const rows = desk?.countries || [];
    if (!rows.length) {
      toast.error("Import countries first.");
      return;
    }
    setBusy("all");
    let failed = 0;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      setProgress(`${index + 1} / ${rows.length} · ${row.name}`);
      try {
        const result = await importRentServices({ data: { country: row.slug } });
        if (result.error) failed += 1;
      } catch {
        failed += 1;
      }
    }
    setProgress("");
    setBusy("");
    toast.success(failed ? `Import finished with ${failed} failed countries.` : "Import finished.");
    load();
  };

  const savePricing = async () => {
    setBusy("pricing");
    try {
      const saved = await saveRentPricing({ data: draftPricing });
      if (saved.error) toast.error(saved.error);
      else toast.success("Rent Number pricing saved.");
      load();
    } catch {
      toast.error("Could not save Rent Number pricing.");
    } finally {
      setBusy("");
    }
  };

  const findNames = async (query: string) => {
    setNameQ(query);
    if (!query.trim()) {
      setNames([]);
      return;
    }
    try {
      const rows = await searchRentCatalogue({ data: { query } });
      setNames(rows.map((row) => ({ service: row.service, label: row.label, variants: Number(row.variants) || 0 })));
      setLabels((current) => ({ ...current, ...Object.fromEntries(rows.map((row) => [row.service, current[row.service] ?? row.label])) }));
    } catch {
      toast.error("Could not search services.");
    }
  };

  const saveLabel = async (service: string) => {
    setBusy(`label:${service}`);
    try {
      const saved = await saveRentLabel({ data: { service, label: labels[service] || "" } });
      if (saved.error) toast.error(saved.error);
      else toast.success("Customer name saved.");
    } catch {
      toast.error("Could not save that name.");
    } finally {
      setBusy("");
    }
  };

  const loadVariants = async (slug: string, service: string) => {
    setVariantCountry(slug);
    setVariantService(service);
    if (!slug || !service) {
      setVariants(null);
      return;
    }
    try {
      setVariants(await rentVariantRows({ data: { country: slug, service } }));
    } catch {
      toast.error("Could not load variants.");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Rent numbers</h1>
        <p className="mt-1 text-sm text-muted">This catalogue is separate from Server 1, Server 2, and Server 3. It reuses the existing FiveSim connection. Import does not buy a number.</p>
      </div>
      <section className="rounded-2xl border border-line bg-card p-4 text-sm">
        <h2 className="text-lg font-extrabold">FiveSim connection</h2>
        <p className="mt-2">Key: {desk?.link.connected ? "present" : "missing"}</p>
        <p>Host: {desk?.link.host || "Not connected"}</p>
        <p>Existing server used for the key: {desk?.link.serverId || "none"}{desk?.link.name ? ` · ${desk.link.name}` : ""}</p>
        <p className="mt-2 text-muted">The secret is not shown. Nothing here creates a new provider.</p>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4 text-sm">
        <h2 className="text-lg font-extrabold">Catalogue</h2>
        <p className="mt-2">{desk?.countries.length || 0} countries · {desk?.offers || 0} stocked offers · {activation} activation · {hosting} hosting</p>
        <p className="mt-2 text-muted">{hosting ? "Hosting rows are only the ones FiveSim returned with a price and stock." : "Stored stock is activation only. No hosting row is stored until FiveSim returns Category hosting with a price and stock."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="rounded-xl bg-deep px-3 py-2 text-sm font-extrabold text-on-deep" disabled={!!busy} onClick={() => void importCountries()}>{busy === "countries" ? "Importing…" : "Import countries"}</button>
          <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm font-extrabold" disabled={!!busy} onClick={() => void importAll()}>{busy === "all" ? progress || "Importing…" : "Import services for every country"}</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className="rounded-xl border border-line bg-paper px-3 py-2" value={country} onChange={(event) => setCountry(event.target.value)}>
            <option value="">Choose a country</option>
            {(desk?.countries || []).map((row) => <option key={row.slug} value={row.slug}>{row.name}</option>)}
          </select>
          <button type="button" className="rounded-xl border border-line px-3 py-2 text-sm font-extrabold" disabled={!country || !!busy} onClick={() => void importOne(country)}>Import this country</button>
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4 text-sm">
        <h2 className="text-lg font-extrabold">Pricing settings</h2>
        <p className="mt-1 text-muted">Used only for Rent Number. Number Server 1, 2, and 3 keep their own rates.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="font-bold">USD exchange rate (NGN)</span>
            <input className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value.replace(/[^\d.]/g, ""))} />
          </label>
          <label className="block">
            <span className="font-bold">Margin per USD (NGN)</span>
            <input className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" inputMode="decimal" value={margin} onChange={(event) => setMargin(event.target.value.replace(/[^\d.]/g, ""))} />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 font-bold">
          <input type="checkbox" checked={marginOn} onChange={(event) => setMarginOn(event.target.checked)} />
          Apply margin
        </label>
        <p className="mt-2">Current effective conversion: {effective ? `${naira(effective)} per USD` : "Not set"}</p>
        <button type="button" className="mt-3 rounded-xl bg-deep px-3 py-2 text-sm font-extrabold text-on-deep" disabled={!!busy} onClick={() => void savePricing()}>{busy === "pricing" ? "Saving…" : "Save pricing"}</button>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4 text-sm">
        <h2 className="text-lg font-extrabold">Customer-facing names</h2>
        <p className="mt-1 text-muted">Operators of one service are already a single entry. Give two service ids the same customer name only when they are the same service.</p>
        <input className="mt-3 w-full rounded-xl border border-line bg-paper px-3 py-2" placeholder="Search service" value={nameQ} onChange={(event) => void findNames(event.target.value)} />
        <div className="mt-3 space-y-2">
          {names.map((row) => (
            <div key={row.service} className="flex flex-wrap items-center gap-2 rounded-xl bg-paper px-3 py-2">
              <span className="min-w-28 font-extrabold">{row.service}</span>
              <span className="text-xs text-muted">{row.variants} stored</span>
              <input className="min-w-40 flex-1 rounded-xl border border-line bg-card px-3 py-2" value={labels[row.service] ?? row.label} onChange={(event) => setLabels((current) => ({ ...current, [row.service]: event.target.value }))} />
              <button type="button" className="rounded-xl border border-line px-3 py-2 text-xs font-extrabold" disabled={!!busy} onClick={() => void saveLabel(row.service)}>Save</button>
            </div>
          ))}
          {nameQ.trim() && !names.length ? <p className="text-muted">No service matches that search.</p> : null}
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4 text-sm">
        <h2 className="text-lg font-extrabold">Internal variants</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <select className="rounded-xl border border-line bg-paper px-3 py-2" value={variantCountry} onChange={(event) => void loadVariants(event.target.value, variantService)}>
            <option value="">Country</option>
            {(desk?.countries || []).map((row) => <option key={row.slug} value={row.slug}>{row.name}</option>)}
          </select>
          <input className="rounded-xl border border-line bg-paper px-3 py-2" placeholder="Service id" value={variantService} onChange={(event) => setVariantService(event.target.value)} onBlur={() => void loadVariants(variantCountry, variantService)} />
        </div>
        <div className="mt-3 space-y-2">
          {(variants?.variants || []).map((row) => (
            <p key={row.id} className="rounded-xl bg-paper px-3 py-2">
              {row.operator} · {row.kind} · stock {row.stock.toLocaleString("en-US")} · ${row.priceUsd}{row.rate ? ` · success ${row.rate}%` : ""}{row.price ? ` · ${naira(row.price)}` : ""}{variants?.chosenId === row.id ? " · selected for purchase" : ""}
            </p>
          ))}
          {variantCountry && variantService && variants && !variants.variants.length ? <p className="text-muted">No stored variant for that service.</p> : null}
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-extrabold">Last imports</h2>
        <div className="mt-3 space-y-2">
          {(desk?.imports || []).map((item) => (
            <p key={item.id} className="rounded-xl bg-paper px-3 py-2 text-sm">
              {item.action} · new {item.imported} · updated {item.updated} · skipped {item.skipped} · failed {item.failed}
              <span className="mt-1 block text-xs text-muted">{item.detail} · {when(item.created_at)}</span>
            </p>
          ))}
          {!desk?.imports.length ? <p className="text-sm text-muted">No import has been run.</p> : null}
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-extrabold">Rent number orders</h2>
        <div className="mt-3 space-y-2">
          {orders.map((order) => (
            <Link key={order.id} to="/purchase-result/$orderId" params={{ orderId: order.id }} className="block rounded-xl bg-paper px-3 py-2 text-sm">
              <span className="font-extrabold">{order.title}</span>
              <span className="mt-1 block text-xs text-muted">{users.find((user) => user.id === order.userId)?.email || "Customer"} · {naira(order.amount)} · {order.status} · {order.phone || "no number"}{order.providerUsd ? ` · provider $${order.providerUsd}` : ""} · {when(order.createdAt)}</span>
            </Link>
          ))}
          {!orders.length ? <p className="text-sm text-muted">No Rent number orders yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
