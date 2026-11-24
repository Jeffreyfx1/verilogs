import { useEffect } from "react";
import { useStore, useUser } from "@/lib/store";

export function SiteTheme() {
  const theme = useStore((s) => s.settings.theme) === "dark" ? "dark" : "light";
  const saveSettings = useStore((s) => s.saveSettings);
  const user = useUser();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0d1c24" : "#174C70");
  }, [theme]);

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
