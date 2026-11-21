import { useEffect, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { WelcomeModal } from "@/components/welcome-modal";
import { BrandLoader } from "@/components/brand-loader";
import { SiteTheme } from "@/components/site-theme";
import { useStore } from "@/lib/store";

export function AppBoot({ children }: { children: ReactNode }) {
  const boot = useStore((s) => s.boot);
  const ready = useStore((s) => s.ready);
  const bootError = useStore((s) => s.bootError);
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    boot();
  }, [boot]);
  if (!ready && path !== "/") {
    return (
      <>
        <BrandLoader caption={bootError || undefined} />
        {bootError ? (
          <div className="fixed inset-x-0 bottom-16 z-20 flex justify-center">
            <button type="button" className="btn-accent rounded-xl px-5 py-2.5 text-sm font-extrabold text-white" onClick={() => boot(true)}>
              Try again
            </button>
          </div>
        ) : null}
      </>
    );
  }
  return (
    <>
      {children}
      <SiteTheme />
      {ready ? <WelcomeModal /> : null}
    </>
  );
}