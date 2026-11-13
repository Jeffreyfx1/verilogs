import type { ReactNode } from "react";
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
  return (
    <span className="inline-flex items-center gap-2">
      {logo.src ? (
        <img src={logo.src} alt="" className="size-9 rounded-xl object-cover" />
      ) : (
        <svg viewBox="0 0 32 32" className="size-9 shrink-0" aria-hidden>
          <rect width="32" height="32" rx="9" fill="#0c7ea3" />
          <rect x="4" y="4" width="24" height="24" rx="7" fill="#08324c" />
          <path
            d="M8.5 12.2c0-1.2 1-2.2 2.2-2.2h10.6c1.2 0 2.2 1 2.2 2.2v4.8c0 1.2-1 2.2-2.2 2.2H14l-2.8 2.3v-2.3h-0.5c-1.2 0-2.2-1-2.2-2.2v-4.8z"
            fill="#f4fbff"
          />
          <path d="M12 13.2h8M12 16h5" stroke="#0c7ea3" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )}
      {compact ? null : <span className="text-lg font-extrabold tracking-tight text-ink">{logo.brand}</span>}
    </span>
  );
}

function useLogo() {
  const settings = useStore((s) => s.settings);
  return { src: settings?.logo || "", brand: settings?.brand || "VeriLogs" };
}
