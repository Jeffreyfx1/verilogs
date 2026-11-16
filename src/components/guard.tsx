import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useStore, useUser } from "@/lib/store";
import { AppShell } from "@/components/shell";
import { BrandLoader } from "@/components/brand-loader";

export function Guard({ admin, children }: { admin?: boolean; children: ReactNode }) {
  const user = useUser();
  const ready = useStore((s) => s.ready);
  const nav = useNavigate();
  useEffect(() => {
    if (!ready) return;
    if (!user) nav({ to: "/login", replace: true });
    else if (admin && user.role !== "admin") nav({ to: "/dashboard", replace: true });
  }, [ready, user, admin, nav]);
  if (!ready || !user || (admin && user.role !== "admin")) {
    return <BrandLoader />;
  }
  return <AppShell admin={admin}>{children}</AppShell>;
}