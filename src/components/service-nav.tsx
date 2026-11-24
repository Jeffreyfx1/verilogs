import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
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

type Listener = () => void;
const listeners = new Set<Listener>();
let navHold = 0;
let pageHold = 0;
let busy = false;
let lock = false;

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  const next = navHold > 0 || pageHold > 0;
  if (next === busy) return;
  busy = next;
  listeners.forEach((listener) => listener());
}

function snapshot() {
  return busy;
}

/** Keep the brand loader up while a catalogue or service page is still opening. Auto-releases so a failed request cannot trap the screen. */
export function holdServiceLoader(maxMs = MAX_MS) {
  pageHold += 1;
  emit();
  let done = false;
  const timer = window.setTimeout(release, maxMs);
  function release() {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    pageHold = Math.max(0, pageHold - 1);
    emit();
  }
  return release;
}

export function useServiceHold(active: boolean) {
  useEffect(() => {
    if (!active) return;
    return holdServiceLoader();
  }, [active]);
}

export function isMajorService(to: string, label: string) {
  if (label === "SMM" || label === "Airtime" || label === "Telegram Premium") return false;
  if (to === "/dashboard/numbers" || to === "/dashboard/rent" || to === "/dashboard/data" || to === "/dashboard/vpn") return true;
  return to === "/dashboard/extra" && /log|vpn/i.test(label);
}

async function runGo(navigate: ReturnType<typeof useNavigate>, opts: GoOpts) {
  if (lock) return;
  lock = true;
  navHold += 1;
  emit();
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
      navHold = Math.max(0, navHold - 1);
      lock = false;
      emit();
    }, wait);
  }
}

export function ServiceNavProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const go = useCallback((opts: GoOpts) => runGo(navigate, opts), [navigate]);
  const active = useSyncExternalStore(subscribe, snapshot, () => false);
  const api = useMemo<Api>(() => ({ busy: active, go }), [active, go]);
  return <ServiceNavContext.Provider value={api}>{children}</ServiceNavContext.Provider>;
}

/** Mounted above the routed tree so a pathname change cannot unmount the loader mid-transition. */
export function ServiceLoadingOverlay() {
  const active = useSyncExternalStore(subscribe, snapshot, () => false);
  if (!active || typeof document === "undefined") return null;
  return createPortal(
    <div className="service-loading" role="status" aria-live="polite" aria-label="Opening service">
      <BrandLoader compact />
    </div>,
    document.body,
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
    if (!api) return;
    event.preventDefault();
    if (api.busy) return;
    void api.go({ to, search, hash });
  };
  return (
    <Link to={to} search={search as never} hash={hash} className={className} aria-busy={api?.busy || undefined} onClick={onClick}>
      {children}
    </Link>
  );
}
