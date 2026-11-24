export function BrandLoader({ caption, compact }: { caption?: string; compact?: boolean }) {
  return (
    <div className={compact ? "grid place-items-center px-6" : "grid min-h-screen place-items-center bg-paper px-6"} role="status" aria-live="polite">
      <div className={compact ? "brand-loader is-compact" : "brand-loader"}>
        <div className="brand-loader-glow">
          <span className="brand-loader-ring" />
          <img src="/icon-192.png" alt="" className="brand-loader-mark" />
        </div>
        <p className="brand-loader-name">VeriLogs</p>
        {caption ? <p className="max-w-xs text-center text-sm text-muted">{caption}</p> : <span className="sr-only">Opening VeriLogs</span>}
      </div>
    </div>
  );
}
