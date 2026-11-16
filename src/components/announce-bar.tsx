import { liveAnnouncements } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export function AnnounceBar() {
  const items = useStore((s) => s.announcements);
  const live = liveAnnouncements(items);
  if (!live.length) return null;
  const text = live.map((item) => (item.body ? `${item.title} — ${item.body}` : item.title)).join("   ·   ");
  return (
    <div className="marquee-wrap border-b border-[#d6e6ed] bg-[#174C70] text-white">
      <div className="marquee py-2 text-sm font-semibold">
        <span className="px-6">{text}</span>
        <span className="px-6" aria-hidden="true">{text}</span>
      </div>
    </div>
  );
}
