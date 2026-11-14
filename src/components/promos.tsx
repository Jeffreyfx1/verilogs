import { useStore } from "@/lib/store";

export function PromoBanners({ className = "" }: { className?: string }) {
  const banners = useStore((s) => s.settings.banners);
  if (!banners.length) return null;
  return (
    <div className={`grid gap-3 sm:grid-cols-2 ${className}`}>
      {banners.map((b, i) => (
        <a key={b.id} href={b.href || "/register"} className={`promo-card rise ${i % 2 ? "promo-card-alt" : ""}`} style={{ animationDelay: `${i * 80}ms` }}>
          <p className="text-lg font-extrabold text-white">{b.title}</p>
          <p className="mt-1 text-sm font-medium text-white/80">{b.body}</p>
        </a>
      ))}
    </div>
  );
}
