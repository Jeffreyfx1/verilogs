import { createContext, useContext, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { BrandLoader } from "@/components/brand-loader";

const MIN_MS = 1000;
const MAX_MS = 12000;

type GoOpts = { to: string; search?: object; hash?: string };

type Api = {
  busy: boolean;
  go: (opts: GoOpts) => Promise<void>;
};

const ServiceNavContext = createContext<Api | null>(null);

export function isMajorService(to: string, label: string) {
  if (label === "SMM" || label === "Airtime" || label === "Telegram Premium") return false;
  if (to === "/dashboard/numbers" || to === "/dashboard/rent" || to === "/dashboard/data" || to === "/dashboard/vpn") return true;
  return to === "/dashboard/extra" && /log|vpn/i.test(label);
}

export function ServiceNavProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  const go = async (opts: GoOpts) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const started = performance.now();
    try {
      await Promise.race([
        navigate({ to: opts.to as never, search: opts.search as never, hash: opts.hash }),
        new Promise((resolve) => window.setTimeout(resolve, MAX_MS)),
      ]);
    } catch {
      /* Leave the current page if navigation fails. */
    } finally {
      const wait = Math.max(0, MIN_MS - (performance.now() - started));
      window.setTimeout(() => {
        lock.current = false;
        setBusy(false);
      }, wait);
    }
  };

  return (
    <ServiceNavContext.Provider value={{ busy, go }}>
      {children}
      {busy ? (
        <div className="fixed inset-0 z-[80]" role="presentation">
          <BrandLoader />
        </div>
      ) : null}
    </ServiceNavContext.Provider>
  );
}

export function ServiceLink({
  to,
  search,
  hash,
  className,
  children,
  onBefore,
}: {
  to: string;
  search?: object;
  hash?: string;
  className?: string;
  children: ReactNode;
  onBefore?: () => void;
}) {
  const api = useContext(ServiceNavContext);
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onBefore?.();
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (!api || api.busy) return;
    void api.go({ to, search, hash });
  };
  return (
    <Link to={to} search={search as never} hash={hash} className={className} aria-busy={api?.busy || undefined} onClick={onClick}>
      {children}
    </Link>
  );
}
