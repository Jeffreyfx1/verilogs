import { useEffect } from "react";

/** Registers the app shell worker only in a top-level window, never inside the preview iframe. */
export function PwaRegister() {
  useEffect(() => {
    if (window.parent !== window) return;
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
