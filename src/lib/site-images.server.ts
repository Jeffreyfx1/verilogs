import { getSql } from "@/lib/db";
import { uid } from "@/lib/money";
import { SITE_SLOTS, imageKind, mimeFor, siteSlot, siteVariant, type SiteSlot, type SiteVariant } from "@/lib/site-images";

type ImageRow = { slot: string; variant: string; mime: string; bytes: string; alt: string; updated_at: string };

export async function saveSiteImage(input: { slot: string; variant: string; base64: string; alt: string }) {
  const slot = siteSlot(input.slot);
  const variant = siteVariant(input.variant);
  if (!slot) return { error: "That section does not exist on the website." };
  const clean = String(input.base64 || "").replace(/^data:[^,]*,/, "").replace(/\s/g, "");
  let bytes: Buffer;
  try {
    bytes = Buffer.from(clean, "base64");
  } catch {
    return { error: "That file could not be read." };
  }
  const kind = imageKind(bytes);
  const mime = mimeFor(kind);
  if (!mime) return { error: "Upload a JPEG, PNG, WebP, or AVIF image under 1.5 MB." };
  const alt = String(input.alt || SITE_SLOTS.find((item) => item.id === slot)?.alt || "").trim().slice(0, 160);
  const sql = await getSql();
  const current = await sql.query<ImageRow>("select slot, variant, mime, bytes, alt, updated_at from shop_site_images where slot = $1 and variant = $2", [slot, variant]);
  const now = new Date().toISOString();
  if (current[0]) {
    await sql.query(
      "insert into shop_site_image_history (id, slot, variant, mime, bytes, alt, created_at) values ($1,$2,$3,$4,$5,$6,$7)",
      [uid("img"), slot, variant, current[0].mime, current[0].bytes, current[0].alt, now],
    );
    await sql.query("update shop_site_images set mime = $3, bytes = $4, alt = $5, updated_at = $6 where slot = $1 and variant = $2", [slot, variant, mime, clean, alt, now]);
    const old = await sql.query<{ id: string }>("select id from shop_site_image_history where slot = $1 and variant = $2 order by created_at desc", [slot, variant]);
    for (const row of old.slice(5)) await sql.query("delete from shop_site_image_history where id = $1", [row.id]);
  } else {
    await sql.query(
      "insert into shop_site_images (slot, variant, mime, bytes, alt, updated_at) values ($1,$2,$3,$4,$5,$6)",
      [slot, variant, mime, clean, alt, now],
    );
  }
  return { error: null as string | null, updatedAt: now };
}

export async function deleteSiteImage(slot: string, variant: string) {
  const safe = siteSlot(slot);
  if (!safe) return { error: "That section does not exist on the website." };
  const which = siteVariant(variant);
  const sql = await getSql();
  const current = await sql.query<ImageRow>("select mime, bytes, alt from shop_site_images where slot = $1 and variant = $2", [safe, which]);
  if (!current[0]) return { error: "No uploaded image is assigned there." };
  const now = new Date().toISOString();
  await sql.query(
    "insert into shop_site_image_history (id, slot, variant, mime, bytes, alt, created_at) values ($1,$2,$3,$4,$5,$6,$7)",
    [uid("img"), safe, which, current[0].mime, current[0].bytes, current[0].alt, now],
  );
  await sql.query("delete from shop_site_images where slot = $1 and variant = $2", [safe, which]);
  return { error: null as string | null };
}

export async function restoreSiteImage(slot: string, variant: string) {
  const safe = siteSlot(slot);
  if (!safe) return { error: "That section does not exist on the website." };
  const which = siteVariant(variant);
  const sql = await getSql();
  const previous = await sql.query<ImageRow>("select id, mime, bytes, alt, created_at from shop_site_image_history where slot = $1 and variant = $2 order by created_at desc limit 1", [safe, which]);
  const row = previous[0] as (ImageRow & { id: string }) | undefined;
  if (!row) return { error: "There is no previous image to restore." };
  const now = new Date().toISOString();
  const current = await sql.query<ImageRow>("select mime, bytes, alt from shop_site_images where slot = $1 and variant = $2", [safe, which]);
  if (current[0]) {
    await sql.query(
      "insert into shop_site_image_history (id, slot, variant, mime, bytes, alt, created_at) values ($1,$2,$3,$4,$5,$6,$7)",
      [uid("img"), safe, which, current[0].mime, current[0].bytes, current[0].alt, now],
    );
    await sql.query("update shop_site_images set mime = $3, bytes = $4, alt = $5, updated_at = $6 where slot = $1 and variant = $2", [safe, which, row.mime, row.bytes, row.alt, now]);
  } else {
    await sql.query(
      "insert into shop_site_images (slot, variant, mime, bytes, alt, updated_at) values ($1,$2,$3,$4,$5,$6)",
      [safe, which, row.mime, row.bytes, row.alt, now],
    );
  }
  await sql.query("delete from shop_site_image_history where id = $1", [row.id]);
  return { error: null as string | null };
}

export async function readSiteImage(slot: string, variant: string) {
  const safe = siteSlot(slot);
  if (!safe) return null;
  const which = siteVariant(variant);
  const sql = await getSql();
  const rows = await sql.query<ImageRow>("select mime, bytes, alt, updated_at from shop_site_images where slot = $1 and variant = $2", [safe, which]);
  if (rows[0]) return rows[0];
  if (which === "mobile") {
    const desktop = await sql.query<ImageRow>("select mime, bytes, alt, updated_at from shop_site_images where slot = $1 and variant = 'desktop'", [safe]);
    return desktop[0] || null;
  }
  return null;
}

export async function listSiteImages() {
  const sql = await getSql();
  const rows = await sql.query<{ slot: string; variant: string; alt: string; updated_at: string }>("select slot, variant, alt, updated_at from shop_site_images");
  const history = await sql.query<{ slot: string; variant: string }>("select slot, variant from shop_site_image_history");
  return SITE_SLOTS.map((slot) => {
    const desktop = rows.find((row) => row.slot === slot.id && row.variant === "desktop");
    const mobile = rows.find((row) => row.slot === slot.id && row.variant === "mobile");
    return {
      id: slot.id,
      label: slot.label,
      alt: desktop?.alt || mobile?.alt || slot.alt,
      desktop: desktop?.updated_at || "",
      mobile: mobile?.updated_at || "",
      canRestoreDesktop: history.some((row) => row.slot === slot.id && row.variant === "desktop"),
      canRestoreMobile: history.some((row) => row.slot === slot.id && row.variant === "mobile"),
    };
  });
}

export type ListedSlot = Awaited<ReturnType<typeof listSiteImages>>[number];
export type { SiteSlot, SiteVariant };
