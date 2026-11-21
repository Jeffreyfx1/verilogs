import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { importRentCountries, importRentServices, rentDesk } from "@/lib/shop-fns";
import { naira, when } from "@/lib/money";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/rent")({ component: RentAdmin });

type Desk = Awaited<ReturnType<typeof rentDesk>>;

function RentAdmin() {
  const orders = useStore((s) => s.orders.filter((order) => order.server === "Rent number"));
  const users = useStore((s) => s.users);
  const [desk, setDesk] = useState<Desk | null>(null);
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState("");

  const load = () => {
    rentDesk().then(setDesk).catch(() => toast.error("Could not load Rent numbers."));
  };

  useEffect(load, []);

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
              <span className="mt-1 block text-xs text-muted">{users.find((user) => user.id === order.userId)?.email || "Customer"} · {naira(order.amount)} · {order.status} · {order.phone || "no number"} · {when(order.createdAt)}</span>
            </Link>
          ))}
          {!orders.length ? <p className="text-sm text-muted">No Rent number orders yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
