import { useEffect } from "react";
import { useStore, useUser } from "@/lib/store";

export function SiteTheme() {
  const theme = useStore((s) => s.settings.theme) === "dark" ? "dark" : "light";
  const saveSettings = useStore((s) => s.saveSettings);
  const user = useUser();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b1524" : "#0A214D");
  }, [theme]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onScroll = (event: Event) => {
      const target = event.target;
      const top = target instanceof Element ? target.scrollTop : window.scrollY;
      const shift = Math.max(0, Math.min(34, top / 26));
      document.documentElement.style.setProperty("--glow-y", `${-8 + shift}%`);
      document.documentElement.style.setProperty("--glow-x", `${88 - shift / 5}%`);
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", onScroll, true);
  }, []);

  if (user?.role !== "admin") return null;

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="site-theme-toggle"
      aria-label={next === "dark" ? "Switch the site to dark mode" : "Switch the site to light mode"}
      onClick={() => { void saveSettings({ theme: next }); }}
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
