export function BrandLoader({ caption }: { caption?: string }) {
  return (
    <div className="grid min-h-screen place-items-center bg-paper px-6" role="status" aria-live="polite">
      <div className="brand-loader">
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
