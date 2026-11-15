import { useEffect, useState } from "react";

export const DEVICES = [
  { id: "auto", label: "This screen", form: "auto", width: 0 },
  { id: "se", label: "iPhone SE", form: "phone", width: 375 },
  { id: "iphone", label: "iPhone 15", form: "phone", width: 390 },
  { id: "plus", label: "iPhone 15 Plus", form: "phone", width: 430 },
  { id: "max", label: "iPhone 16 Pro Max", form: "phone", width: 440 },
  { id: "a15", label: "Galaxy A15", form: "phone", width: 360 },
  { id: "a54", label: "Galaxy A54", form: "phone", width: 384 },
  { id: "s24", label: "Galaxy S24", form: "phone", width: 360 },
  { id: "ultra", label: "Galaxy S24 Ultra", form: "phone", width: 412 },
  { id: "spark", label: "Tecno Spark 20", form: "phone", width: 360 },
  { id: "hot", label: "Infinix Hot 40", form: "phone", width: 360 },
  { id: "pixel", label: "Pixel 8", form: "phone", width: 412 },
  { id: "mini", label: "iPad mini", form: "tablet", width: 768 },
  { id: "ipad", label: "iPad", form: "tablet", width: 820 },
] as const;

const KEY = "verilogs.device";

export function applyDevice(id: string) {
  const device = DEVICES.find((d) => d.id === id) ?? DEVICES[0];
  const root = document.documentElement;
  if (device.id === "auto") {
    delete root.dataset.form;
    delete root.dataset.lock;
    root.style.removeProperty("--device-w");
  } else {
    root.dataset.form = device.form;
    root.dataset.lock = "1";
    root.style.setProperty("--device-w", device.width + "px");
  }
  try {
    localStorage.setItem(KEY, device.id);
  } catch {
    /* ignore */
  }
}

export function DeviceFrame({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyDevice("auto");
    const fit = () => {
      const root = document.documentElement;
      if (root.dataset.lock !== "1") return;
      const locked = Number.parseInt(root.style.getPropertyValue("--device-w"), 10);
      if (locked && window.innerWidth < locked + 32) applyDevice("auto");
    };
    window.addEventListener("resize", fit);
    window.addEventListener("orientationchange", fit);
    return () => {
      window.removeEventListener("resize", fit);
      window.removeEventListener("orientationchange", fit);
    };
  }, []);
  return (
    <div id="verilogs-app" className="min-h-screen bg-paper">
      {children}
    </div>
  );
}

export function DevicePicker({ compact = false }: { compact?: boolean }) {
  const [id, setId] = useState("auto");
  useEffect(() => {
    setId("auto");
    applyDevice("auto");
  }, []);
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-muted">
      {compact ? null : <span className="hidden sm:inline">My phone</span>}
      <select
        aria-label="Best view for my phone"
        className="device-select rounded-xl border border-line bg-paper px-2 py-2 text-xs font-semibold text-ink"
        value={id}
        onChange={(e) => {
          setId(e.target.value);
          applyDevice(e.target.value);
        }}
      >
        {DEVICES.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
    </label>
  );
}
