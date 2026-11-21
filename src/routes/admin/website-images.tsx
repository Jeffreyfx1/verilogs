import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { deleteSiteImage, restoreSiteImage, saveSiteImage, siteImageDesk } from "@/lib/shop-fns";
import { fallbackPhoto, type SiteVariant } from "@/lib/site-images";

export const Route = createFileRoute("/admin/website-images")({ component: WebsiteImages });

type Slot = Awaited<ReturnType<typeof siteImageDesk>>[number];

async function fileToWebp(file: File, variant: SiteVariant) {
  const bitmap = await createImageBitmap(file);
  const max = variant === "mobile" ? 750 : 1200;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.8));
  bitmap.close();
  if (!blob) throw new Error("Could not prepare that image.");
  if (blob.size > 1_500_000) throw new Error("That image is still over 1.5 MB after resizing.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function WebsiteImages() {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [alts, setAlts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const load = () => {
    siteImageDesk().then((rows) => {
      setSlots(rows);
      setAlts(Object.fromEntries(rows.map((row) => [row.id, row.alt])));
    }).catch(() => toast.error("Could not load website images."));
  };

  useEffect(load, []);

  const stamp = (slot: Slot, variant: SiteVariant) => (variant === "mobile" ? slot.mobile : slot.desktop);

  const publish = async (slot: Slot, variant: SiteVariant, file: File) => {
    const key = `${slot.id}:${variant}`;
    setBusy(key);
    try {
      const base64 = await fileToWebp(file, variant);
      const saved = await saveSiteImage({ data: { slot: slot.id, variant, base64, alt: alts[slot.id] || slot.alt } });
      if (saved.error) toast.error(saved.error);
      else {
        toast.success("Published. The site is using this photo.");
        setPreviews((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        load();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not publish that photo.");
    } finally {
      setBusy("");
    }
  };

  const remove = async (slot: Slot, variant: SiteVariant) => {
    if (!window.confirm("Remove this photo? The site will use the built-in fallback until you upload another.")) return;
    const key = `${slot.id}:${variant}:delete`;
    setBusy(key);
    try {
      const saved = await deleteSiteImage({ data: { slot: slot.id, variant } });
      if (saved.error) toast.error(saved.error);
      else {
        toast.success("Removed. The fallback photo is showing.");
        load();
      }
    } catch {
      toast.error("Could not remove that photo.");
    } finally {
      setBusy("");
    }
  };

  const restore = async (slot: Slot, variant: SiteVariant) => {
    const key = `${slot.id}:${variant}:restore`;
    setBusy(key);
    try {
      const saved = await restoreSiteImage({ data: { slot: slot.id, variant } });
      if (saved.error) toast.error(saved.error);
      else {
        toast.success("Previous photo restored.");
        load();
      }
    } catch {
      toast.error("Could not restore that photo.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Website images</h1>
        <p className="mt-1 text-sm text-muted">Upload a photo from this device. Saving publishes it on the homepage. The site resizes it to WebP. Desktop is kept near 1200px wide and mobile near 750px. No code deploy. JPEG, PNG, WebP, and AVIF only, under 1.5 MB. If a slot is empty, the built-in photograph is used.</p>
      </div>
      {slots.map((slot) => (
        <article key={slot.id} className="space-y-3 rounded-2xl border border-line bg-card p-4">
          <h2 className="text-lg font-extrabold">{slot.label}</h2>
          <label className="block text-sm">
            <span className="font-bold">Alt text</span>
            <input className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" value={alts[slot.id] || ""} onChange={(event) => setAlts((current) => ({ ...current, [slot.id]: event.target.value }))} />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            {(["desktop", "mobile"] as SiteVariant[]).map((variant) => {
              const key = `${slot.id}:${variant}`;
              const published = stamp(slot, variant);
              const src = previews[key] || (published ? `/api/site-image/${slot.id}?variant=${variant}&t=${encodeURIComponent(published)}` : fallbackPhoto(slot.id));
              const canRestore = variant === "mobile" ? slot.canRestoreMobile : slot.canRestoreDesktop;
              return (
                <div key={variant} className="rounded-xl border border-line bg-paper p-3">
                  <p className="text-sm font-extrabold capitalize">{variant}</p>
                  <img src={src} alt={alts[slot.id] || slot.alt} className="mt-2 h-36 w-full rounded-xl object-cover" />
                  <p className="mt-2 text-xs text-muted">{published ? "Uploaded photo" : "Built-in fallback"}</p>
                  <label className="mt-2 block text-sm font-bold text-primary">
                    {busy === key ? "Publishing…" : published ? "Replace" : "Upload"}
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      disabled={!!busy}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file) return;
                        const local = URL.createObjectURL(file);
                        setPreviews((current) => ({ ...current, [key]: local }));
                        void publish(slot, variant, file);
                      }}
                    />
                  </label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {published ? <button type="button" className="rounded-xl border border-line px-3 py-1.5 text-xs font-extrabold" disabled={!!busy} onClick={() => void remove(slot, variant)}>Delete</button> : null}
                    {canRestore ? <button type="button" className="rounded-xl border border-line px-3 py-1.5 text-xs font-extrabold" disabled={!!busy} onClick={() => void restore(slot, variant)}>Restore previous</button> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </article>
      ))}
    </div>
  );
}
