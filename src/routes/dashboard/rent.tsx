import { useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { buyRentNumber, cancelRentNumber, finishRentNumber, listRentCountries, listRentServices } from "@/lib/shop-fns";
import { naira, when } from "@/lib/money";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/rent")({ component: RentPage });

type Country = { slug: string; name: string };
type Service = { id: string; service: string; operator: string; kind: string; stock: number; price: number };

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
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingServices, setLoadingServices] = useState(false);
  const [buying, setBuying] = useState("");
  const [acting, setActing] = useState("");
  const keys = useRef(new Map<string, string>());

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
    listRentServices({ data: { country } }).then((res) => {
      if (res.error) toast.error(res.error);
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
      <label className="block text-sm font-bold">
        Country
        <select className="mt-1 w-full rounded-xl border border-line bg-card px-3 py-3 text-base" value={country} onChange={(event) => setCountry(event.target.value)}>
          <option value="">{loading ? "Loading countries…" : "Choose a country"}</option>
          {countries.map((row) => <option key={row.slug} value={row.slug}>{row.name}</option>)}
        </select>
      </label>
      {!loading && !countries.length ? <p className="rounded-2xl border border-line bg-card p-4 text-sm text-muted">Nothing is available right now.</p> : null}
      {country ? (
        <div className="space-y-2">
          {loadingServices ? <p className="text-sm text-muted">Loading services…</p> : null}
          {!loadingServices && !services.length ? <p className="text-sm text-muted">Nothing is available for this country right now.</p> : null}
          {services.map((offer) => (
            <article key={offer.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card p-3">
              <div>
                <p className="font-extrabold">{offer.service}</p>
                <p className="text-xs text-muted">{offer.kind} · stock {offer.stock} · operator {offer.operator}</p>
              </div>
              <button type="button" className="rounded-xl bg-deep px-3 py-2 text-sm font-extrabold text-on-deep" disabled={!!buying} onClick={() => void buy(offer)}>
                {buying === offer.id ? "Buying…" : naira(offer.price)}
              </button>
            </article>
          ))}
        </div>
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
