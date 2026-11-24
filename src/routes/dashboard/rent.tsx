import { useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { buyRentNumber, cancelRentNumber, finishRentNumber, listRentCountries, listRentServices } from "@/lib/shop-fns";
import { naira, when } from "@/lib/money";
import { flagEmoji, rentSearchHit } from "@/lib/rent";
import { useStore, useUser } from "@/lib/store";
import { inputClass } from "@/components/ui";
import { useServiceHold } from "@/components/service-nav";

export const Route = createFileRoute("/dashboard/rent")({ component: RentPage });

type Country = { slug: string; name: string; iso: string };
type Service = { id: string; service: string; stock: number; price: number; rate: number | null };

function RentPage() {
  const user = useUser();
  const adopt = useStore((s) => s.adopt);
  const allOrders = useStore((s) => s.orders);
  const session = useStore((s) => s.sessionUserId);
  const orders = useMemo(
    () => allOrders.filter((order) => order.userId === session && order.server === "Rent number"),
    [allOrders, session],
  );
  const nav = useNavigate();
  const [countries, setCountries] = useState<Country[]>([]);
  const [country, setCountry] = useState("");
  const [countryQ, setCountryQ] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [serviceQ, setServiceQ] = useState("");
  const [serviceOpen, setServiceOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [priceNote, setPriceNote] = useState("");
  const [buying, setBuying] = useState("");
  const [acting, setActing] = useState("");
  const keys = useRef(new Map<string, string>());
  const shownCountries = countries.filter((row) => rentSearchHit(row.name, countryOpen ? countryQ : ""));
  const shownServices = services.filter((row) => rentSearchHit(row.service, serviceOpen ? serviceQ : ""));
  const opening = loading || (!!country && loadingServices && services.length === 0 && !serviceQ.trim());
  useServiceHold(opening);
  const selectedCountry = countries.find((row) => row.slug === country);
  const selected = services.find((row) => row.id === serviceId);

  useEffect(() => {
    listRentCountries().then((res) => {
      if (res.error) toast.error(res.error);
      setCountries(res.countries || []);
    }).catch(() => toast.error("Could not load Rent numbers.")).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!country) {
      setServices([]);
      return;
    }
    setLoadingServices(true);
    setPriceNote("");
    setServiceId("");
    listRentServices({ data: { country } }).then((res) => {
      if (res.error) setPriceNote(res.error);
      setServices(res.services || []);
    }).catch(() => toast.error("Could not load services.")).finally(() => setLoadingServices(false));
  }, [country]);

  const buy = async (offer: Service) => {
    let key = keys.current.get(offer.id);
    if (!key) {
      key = crypto.randomUUID();
      keys.current.set(offer.id, key);
    }
    setBuying(offer.id);
    try {
      const res = await buyRentNumber({ data: { offerId: offer.id, idempotencyKey: key } });
      if (res.error) {
        if (!/already processing/i.test(res.error)) keys.current.delete(offer.id);
        toast.error(res.error);
        return;
      }
      if (res.state) adopt(res.state);
      keys.current.delete(offer.id);
      if (!res.orderId) {
        toast.error("The rental was processed, but the order could not be opened.");
        return;
      }
      void nav({ to: "/purchase-result/$orderId", params: { orderId: res.orderId } });
    } catch {
      toast.error("The request did not finish. Use the same button again. It will not buy twice.");
    } finally {
      setBuying("");
    }
  };

  const act = async (orderId: string, action: "cancel" | "finish") => {
    setActing(orderId + action);
    try {
      const res = action === "cancel" ? await cancelRentNumber({ data: { orderId } }) : await finishRentNumber({ data: { orderId } });
      if (res.error || !res.state) toast.error(res.error || "Could not update that rental.");
      else {
        adopt(res.state);
        toast.success(action === "cancel" ? "Rental cancelled and refunded." : "Rental marked finished.");
      }
    } catch {
      toast.error("Could not update that rental.");
    } finally {
      setActing("");
    }
  };

  return (
    <div className="space-y-4">
      <section className="wallet-band overflow-hidden rounded-[1.85rem] bg-gradient-to-r from-cyan-400 via-teal-400 to-blue-600 px-5 py-5 text-white shadow-[0_12px_30px_rgba(8,50,74,0.18)]">
        <p className="text-xs font-bold text-white/80">Wallet balance</p>
        <p className="text-4xl font-extrabold tracking-tight">{naira(user?.balance || 0)}</p>
        <Link to="/dashboard/wallet" className="mt-3 inline-block rounded-full bg-white/20 px-3 py-1.5 text-xs font-extrabold">+ Fund wallet</Link>
      </section>
      <div>
        <h1 className="text-2xl font-extrabold">Rent number</h1>
        <p className="mt-1 text-sm text-muted">Choose a country, then a service.</p>
      </div>
      <label className="block text-sm font-bold">Country</label>
      <div className="relative">
        <input
          className={inputClass}
          placeholder="Search country..."
          value={countryOpen ? countryQ : selectedCountry ? `${flagEmoji(selectedCountry.iso)} ${selectedCountry.name}`.trim() : ""}
          onFocus={() => { setCountryOpen(true); setCountryQ(""); }}
          onBlur={() => window.setTimeout(() => setCountryOpen(false), 150)}
          onChange={(event) => { setCountryQ(event.target.value); setCountryOpen(true); }}
        />
        {countryOpen ? (
          <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-line bg-card shadow-card">
            {shownCountries.map((row) => (
              <button key={row.slug} type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary hover:text-on-primary" onMouseDown={(event) => event.preventDefault()} onClick={() => { setCountry(row.slug); setCountryQ(""); setCountryOpen(false); setServiceId(""); setServiceQ(""); }}>
                <span>{flagEmoji(row.iso) || "🌐"}</span>
                <span>{row.name}</span>
              </button>
            ))}
            {!loading && !shownCountries.length ? <p className="px-3 py-3 text-sm text-muted">{countryQ.trim() ? "No country matches that search." : "Nothing is available right now."}</p> : null}
          </div>
        ) : null}
      </div>
      {country ? (
        <>
          <label className="block text-sm font-bold">Service</label>
          <div className="relative">
            <input
              className={inputClass}
              placeholder="Search service..."
              value={serviceOpen ? serviceQ : selected?.service || ""}
              onFocus={() => { setServiceOpen(true); setServiceQ(""); }}
              onBlur={() => window.setTimeout(() => setServiceOpen(false), 150)}
              onChange={(event) => { setServiceQ(event.target.value); setServiceOpen(true); setServiceId(""); }}
            />
            {serviceOpen ? (
              <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-line bg-card shadow-card">
                {loadingServices ? <p className="px-3 py-3 text-sm text-muted">Loading services…</p> : null}
                {shownServices.map((offer) => (
                  <button key={offer.id} type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-primary hover:text-on-primary" onMouseDown={(event) => event.preventDefault()} onClick={() => { setServiceId(offer.id); setServiceQ(""); setServiceOpen(false); }}>
                    <span>{offer.service}</span>
                    <span className="text-xs">{naira(offer.price)}</span>
                  </button>
                ))}
                {!loadingServices && !shownServices.length ? <p className="px-3 py-3 text-sm text-muted">{priceNote || (serviceQ.trim() ? "No service matches that search." : "Nothing is available for this country right now.")}</p> : null}
              </div>
            ) : null}
          </div>
          {selected ? (
            <article className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-3">
              <div>
                <p className="font-extrabold">{selected.service}</p>
                <p className="text-xs text-muted">Stock {selected.stock.toLocaleString("en-US")}{selected.rate ? ` · success ${selected.rate}%` : ""}</p>
              </div>
              <button type="button" className="rounded-xl bg-deep px-3 py-2 text-sm font-extrabold text-on-deep" disabled={!!buying} onClick={() => void buy(selected)}>
                {buying === selected.id ? "Buying…" : naira(selected.price)}
              </button>
            </article>
          ) : null}
        </>
      ) : null}
      <section className="space-y-2">
        <h2 className="text-lg font-extrabold">Your Rent number orders</h2>
        {orders.map((order) => (
          <article key={order.id} className="rounded-2xl border border-line bg-card p-3 text-sm">
            <p className="font-extrabold">{order.title}</p>
            <p className="text-xs text-muted">{naira(order.amount)} · {order.status} · {order.phone || "no number yet"} · {when(order.createdAt)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link to="/purchase-result/$orderId" params={{ orderId: order.id }} className="rounded-xl border border-line px-3 py-1.5 text-xs font-extrabold">Open delivery</Link>
              {order.status === "waiting" ? (
                <>
                  <button type="button" className="rounded-xl border border-line px-3 py-1.5 text-xs font-extrabold" disabled={!!acting} onClick={() => void act(order.id, "cancel")}>Cancel</button>
                  <button type="button" className="rounded-xl border border-line px-3 py-1.5 text-xs font-extrabold" disabled={!!acting} onClick={() => void act(order.id, "finish")}>Finish</button>
                </>
              ) : null}
            </div>
          </article>
        ))}
        {!orders.length ? <p className="text-sm text-muted">No Rent number orders on this account.</p> : null}
      </section>
    </div>
  );
}
