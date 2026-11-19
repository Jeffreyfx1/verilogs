import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { suggestedAirtimeRoute, type AirtimeNetworkRecord, type AirtimeRouteRecord } from "@/lib/airtime";
import { naira } from "@/lib/money";
import { deleteAirtimeNetwork, deleteAirtimeRoute, listAirtimeAdmin, saveAirtimeNetwork, saveAirtimeRoute } from "@/lib/shop-fns";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/airtime")({ component: AirtimeAdminPage });

const EMPTY_ROUTE = {
  id: "",
  providerId: "",
  providerNetworkId: "",
  purchasePath: "",
  authHeader: "Authorization",
  authPrefix: "Token",
  networkField: "network",
  phoneField: "phone",
  amountField: "amount",
  refField: "ref",
  extraJson: "{}",
  enabled: false,
};

function AirtimeAdminPage() {
  const providers = useStore((s) => s.providers);
  const [networks, setNetworks] = useState<AirtimeNetworkRecord[]>([]);
  const [routes, setRoutes] = useState<AirtimeRouteRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [minAmount, setMinAmount] = useState("50");
  const [maxAmount, setMaxAmount] = useState("50000");
  const [profit, setProfit] = useState("");
  const [route, setRoute] = useState(EMPTY_ROUTE);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await listAirtimeAdmin();
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setNetworks(res.networks || []);
    setRoutes(res.routes || []);
    setSelected((current) => current || res.networks?.[0]?.id || "");
  };

  useEffect(() => { void load().catch(() => toast.error("Airtime networks could not be loaded.")); }, []);

  const network = networks.find((item) => item.id === selected);
  useEffect(() => {
    if (!network) return;
    setName(network.name);
    setImageUrl(network.imageUrl);
    setEnabled(network.enabled);
    setMinAmount(String(network.minAmount));
    setMaxAmount(String(network.maxAmount));
    setProfit(network.profitNaira == null ? "" : String(network.profitNaira));
    setRoute(EMPTY_ROUTE);
  }, [network?.id]);

  const networkRoutes = routes.filter((item) => item.networkId === selected);
  const saveNetwork = async () => {
    setBusy(true);
    const res = await saveAirtimeNetwork({
      data: {
        id: network?.id || "",
        name,
        imageUrl,
        enabled,
        minAmount: Number(minAmount),
        maxAmount: Number(maxAmount),
        profitNaira: profit.trim() === "" ? null : Number(profit),
      },
    });
    setBusy(false);
    if (res.error) return toast.error(res.error);
    toast.success("Network saved");
    await load();
  };
  const saveRoute = async () => {
    if (!network) return;
    setBusy(true);
    const res = await saveAirtimeRoute({ data: { ...route, networkId: network.id } });
    setBusy(false);
    if (res.error) return toast.error(res.error);
    toast.success("Provider route saved");
    setRoute(EMPTY_ROUTE);
    await load();
  };
  const applyProvider = (providerId: string) => {
    const provider = providers.find((item) => item.id === providerId);
    const suggested = provider ? suggestedAirtimeRoute(provider.baseUrl) : null;
    setRoute((current) => ({
      ...current,
      providerId,
      purchasePath: current.purchasePath || suggested?.purchasePath || "",
      authHeader: current.authHeader || suggested?.authHeader || "Authorization",
      authPrefix: current.authPrefix || suggested?.authPrefix || "",
      networkField: suggested?.networkField || current.networkField,
      phoneField: suggested?.phoneField || current.phoneField,
      amountField: suggested?.amountField || current.amountField,
      refField: suggested?.refField || current.refField,
      extraJson: suggested ? JSON.stringify(suggested.extra) : current.extraJson,
    }));
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Airtime networks</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Airtime is an amount, not a list of plans. Type the provider network id yourself. VeriLogs does not guess it, and it never calls the purchase address while importing.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {networks.map((item) => (
          <button key={item.id} type="button" onClick={() => setSelected(item.id)} className={`rounded-xl border px-3 py-2 text-sm font-bold ${selected === item.id ? "border-primary" : "border-line bg-card"}`}>
            {item.name}{item.enabled ? "" : " · off"}
          </button>
        ))}
      </div>
      <section className="space-y-3 rounded-card border border-line bg-card p-4">
        <h2 className="font-bold">{network ? "Edit network" : "Add network"}</h2>
        <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="MTN" /></Field>
        <Field label="Logo URL" hint="Optional. Leave blank to use the colour chip."><input className={inputClass} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://" /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Minimum amount"><input className={inputClass} inputMode="numeric" value={minAmount} onChange={(e) => setMinAmount(e.target.value.replace(/[^\d]/g, ""))} /></Field>
          <Field label="Maximum amount"><input className={inputClass} inputMode="numeric" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value.replace(/[^\d]/g, ""))} /></Field>
        </div>
        <Field label="Profit (₦)" hint="Blank uses the shop airtime profit. This is a fixed naira amount, not a percentage.">
          <input className={inputClass} inputMode="numeric" value={profit} onChange={(e) => setProfit(e.target.value.replace(/[^\d]/g, ""))} placeholder="Shop default" />
        </Field>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Active for customers</label>
        <div className="flex flex-wrap gap-2">
          <Button busy={busy} onClick={() => void saveNetwork()}>Save network</Button>
          {network ? <Button tone="soft" onClick={() => { setSelected(""); setName(""); setImageUrl(""); setEnabled(false); setProfit(""); }}>New network</Button> : null}
          {network && !["mtn", "airtel", "glo", "9mobile"].includes(network.brand) ? (
            <Button tone="soft" onClick={() => void deleteAirtimeNetwork({ data: { id: network.id } }).then((res) => { if (res.error) toast.error(res.error); else { toast.success("Network removed"); setSelected(""); void load(); } })}>Remove</Button>
          ) : null}
        </div>
      </section>
      {network ? (
        <section className="space-y-3 rounded-card border border-line bg-card p-4">
          <h2 className="font-bold">Provider route</h2>
          <p className="text-sm text-muted">Each provider keeps its own network id and purchase fields. Turning one route on switches the others off. SMEAPI’s documented purchase is POST /api/airtime/ with Authorization: Token. The network id stays blank until you type it.</p>
          {networkRoutes.map((item) => {
            const provider = providers.find((row) => row.id === item.providerId);
            return (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper p-3 text-sm">
                <div>
                  <p className="font-semibold">{provider?.name || item.providerId} · id {item.providerNetworkId || "not set"}</p>
                  <p className="text-muted">{item.purchasePath || "No purchase path"} · {item.enabled ? "Active" : "Off"}</p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="font-semibold text-primary" onClick={() => setRoute({ ...item, extraJson: JSON.stringify(item.extra || {}) })}>Edit</button>
                  <button type="button" className="font-semibold text-danger" onClick={() => void deleteAirtimeRoute({ data: { id: item.id } }).then((res) => { if (res.error) toast.error(res.error); else { toast.success("Route removed"); void load(); } })}>Remove</button>
                </div>
              </div>
            );
          })}
          <Field label="Provider">
            <select className={inputClass} value={route.providerId} onChange={(e) => applyProvider(e.target.value)}>
              <option value="">Choose</option>
              {providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </Field>
          <Field label="Provider network id" hint="From the provider. Do not leave this as a guess.">
            <input className={inputClass} value={route.providerNetworkId} onChange={(e) => setRoute({ ...route, providerNetworkId: e.target.value })} />
          </Field>
          <Field label="Purchase path" hint="Sent only when a customer confirms. Example for SMEAPI: /api/airtime/">
            <input className={inputClass} value={route.purchasePath} onChange={(e) => setRoute({ ...route, purchasePath: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Auth header"><input className={inputClass} value={route.authHeader} onChange={(e) => setRoute({ ...route, authHeader: e.target.value })} /></Field>
            <Field label="Auth prefix"><input className={inputClass} value={route.authPrefix} onChange={(e) => setRoute({ ...route, authPrefix: e.target.value })} placeholder="Token" /></Field>
            <Field label="Network field"><input className={inputClass} value={route.networkField} onChange={(e) => setRoute({ ...route, networkField: e.target.value })} /></Field>
            <Field label="Phone field"><input className={inputClass} value={route.phoneField} onChange={(e) => setRoute({ ...route, phoneField: e.target.value })} /></Field>
            <Field label="Amount field"><input className={inputClass} value={route.amountField} onChange={(e) => setRoute({ ...route, amountField: e.target.value })} /></Field>
            <Field label="Reference field"><input className={inputClass} value={route.refField} onChange={(e) => setRoute({ ...route, refField: e.target.value })} /></Field>
          </div>
          <Field label="Extra JSON"><textarea className={`${inputClass} font-mono text-xs`} rows={2} value={route.extraJson} onChange={(e) => setRoute({ ...route, extraJson: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={route.enabled} onChange={(e) => setRoute({ ...route, enabled: e.target.checked })} /> Use this provider for the network</label>
          <Button busy={busy} onClick={() => void saveRoute()}>{route.id ? "Update route" : "Add route"}</Button>
          {network.enabled && networkRoutes.filter((item) => item.enabled && item.providerNetworkId && item.purchasePath).length !== 1 ? (
            <p className="text-sm text-muted">Customers cannot buy {network.name} until exactly one route has a provider id and a purchase path.</p>
          ) : null}
          {network.profitNaira == null ? <p className="text-xs text-muted">Customer charge is the amount plus the shop airtime profit. A {naira(500)} recharge shows that profit on top.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
