import { useEffect, type ReactNode } from "react";
import { WelcomeModal } from "@/components/welcome-modal";
import { useStore } from "@/lib/store";

export function AppBoot({ children }: { children: ReactNode }) {
  const boot = useStore((s) => s.boot);
  const tick = useStore((s) => s.tickWaiting);
  const ready = useStore((s) => s.ready);
  useEffect(() => {
    boot();
  }, [boot]);
  useEffect(() => {
    const t = setInterval(() => tick(), 2000);
    return () => clearInterval(t);
  }, [tick]);
  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-paper text-sm text-muted">
        Opening VeriLogs…
      </div>
    );
  }
  return (
    <>
      {children}
      <WelcomeModal />
    </>
  );
}
