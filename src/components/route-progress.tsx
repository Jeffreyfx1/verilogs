import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

export function RouteProgress() {
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!pending) {
      setVisible(false);
      return;
    }
    const show = window.setTimeout(() => setVisible(true), 140);
    const hide = window.setTimeout(() => setVisible(false), 20000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [pending]);
  if (!visible) return null;
  return <div className="route-progress" role="progressbar" aria-label="Opening page" />;
}
