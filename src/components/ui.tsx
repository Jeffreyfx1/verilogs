import type { ReactNode } from "react";
import { logoMark } from "@/components/logo-mark";
import { useStore } from "@/lib/store";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-card border border-line bg-card shadow-card ${className}`}>{children}</section>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none ring-primary/30 placeholder:text-muted focus:ring-2";

const tones = {
  solid: "btn-gradient shadow-card",
  soft: "border border-line bg-card text-ink hover:border-primary",
  ghost: "bg-transparent text-primary hover:bg-paper",
  danger: "border border-line bg-card text-danger",
};

export function Button({
  children,
  onClick,
  type = "button",
  disabled,
  tone = "solid",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  tone?: keyof typeof tones;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  const logo = useLogo();
  if (logo.src) {
    return (
      <span className="inline-flex items-center gap-2">
        <img src={logo.src} alt="" className="size-9 rounded-xl object-cover" />
        {compact ? null : <span className="text-lg font-extrabold tracking-tight text-ink">{logo.brand}</span>}
      </span>
    );
  }
  return (
    <img
      src={logoMark}
      alt={logo.brand}
      className={compact ? "h-9 w-auto" : "h-11 w-auto max-w-[11rem] object-contain"}
    />
  );
}

function useLogo() {
  const settings = useStore((s) => s.settings);
  return { src: settings?.logo || "", brand: settings?.brand || "VeriLogs" };
}
