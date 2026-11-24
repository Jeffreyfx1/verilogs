/** Homepage photograph slots. These are the sections that actually show a picture. */

export const SITE_SLOTS = [
  { id: "hero", label: "Homepage hero", alt: "Person using a smartphone" },
  { id: "numbers", label: "Virtual numbers", alt: "Person reading a message on a phone" },
  { id: "data", label: "Data and airtime", alt: "Person using a phone at a table" },
  { id: "logs", label: "Account logs", alt: "Person working on a laptop" },
  { id: "banner-wa", label: "WhatsApp banner", alt: "Hand holding a smartphone" },
] as const;

export type SiteSlot = (typeof SITE_SLOTS)[number]["id"];
export type SiteVariant = "desktop" | "mobile";

const MAX_BYTES = 1_500_000;

export function siteSlot(value: string): SiteSlot | null {
  return SITE_SLOTS.some((slot) => slot.id === value) ? value as SiteSlot : null;
}

export function siteVariant(value: string): SiteVariant {
  return value === "mobile" ? "mobile" : "desktop";
}

export function fallbackPhoto(slot: string) {
  return staticPhoto(slot, "desktop");
}

export function staticPhoto(slot: string, variant: SiteVariant = "desktop") {
  const safe = siteSlot(slot) || "hero";
  return variant === "mobile" ? `/photos/${safe}-m.webp` : `/photos/${safe}.webp`;
}

/** Versioned admin uploads can be cached for a year. A new upload changes the version. */
export function imageCacheControl(version: string, updatedAt: string) {
  if (version && updatedAt && version === updatedAt) return "public, max-age=31536000, immutable";
  return "public, max-age=300";
}

export function photoSlotFor(title: string): SiteSlot {
  const text = String(title || "").toLowerCase();
  if (/number/.test(text)) return "numbers";
  if (/data|airtime/.test(text)) return "data";
  if (/log|social/.test(text)) return "logs";
  return "logs";
}

export function imageKind(bytes: Uint8Array): "jpeg" | "png" | "webp" | "avif" | "" {
  if (bytes.length < 12 || bytes.length > MAX_BYTES) return "";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  const head = String.fromCharCode(...bytes.slice(0, 12));
  if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP") return "webp";
  if (head.slice(4, 8) === "ftyp") {
    const brand = head.slice(8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
  }
  return "";
}

export function mimeFor(kind: ReturnType<typeof imageKind>) {
  if (kind === "jpeg") return "image/jpeg";
  if (kind === "png") return "image/png";
  if (kind === "webp") return "image/webp";
  if (kind === "avif") return "image/avif";
  return "";
}
