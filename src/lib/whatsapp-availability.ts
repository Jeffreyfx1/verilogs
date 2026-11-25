/** FiveSim countries publish hundreds of services. The customer list used to keep
 * the first 100 names, which hid Telegram and every later service. The page now
 * returns the whole country up to this cap. The helper below only puts WhatsApp
 * back if a smaller page is requested.
 */

export function serviceSlug(name: string) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isWhatsAppService(name: string) {
  return serviceSlug(name) === "whatsapp";
}

/** An empty list, or a search that is a prefix of the WhatsApp slug. */
export function wantsWhatsAppLookup(q: string) {
  const slug = serviceSlug(q);
  if (!slug) return true;
  return slug.length >= 3 && "whatsapp".startsWith(slug);
}

export function isFiveSimServer1(provider: { baseUrl?: string; serverId?: string } | null | undefined) {
  if (!provider) return false;
  const raw = String(provider.baseUrl || "").trim();
  let host = "";
  if (raw) {
    try {
      host = new URL(raw).hostname.toLowerCase();
    } catch {
      try {
        host = new URL(`https://${raw}`).hostname.toLowerCase();
      } catch {
        host = "";
      }
    }
  }
  if (host !== "5sim.net" && !host.endsWith(".5sim.net")) return false;
  const slot = String(provider.serverId || "").trim().toLowerCase();
  return slot === "" || slot === "1";
}

export function withWhatsAppService<T extends { service: string }>(page: T[], extra: T | null | undefined) {
  if (!extra || !isWhatsAppService(extra.service)) return page;
  if (page.some((row) => isWhatsAppService(row.service))) return page;
  return [...page, extra];
}

export function preferWhatsApp<T extends { service: string }>(rows: T[]) {
  const matches = rows.filter((row) => isWhatsAppService(row.service));
  return matches.find((row) => row.service === "WhatsApp") || matches[0] || null;
}

/** Keep the existing alphabetical page. Append one real WhatsApp row when it was cut off. */
export function finishServicePage<T extends { service: string }>(
  ranked: T[],
  limit: number,
  input: { fiveSim: boolean; q: string; offer: T | null },
) {
  const page = ranked.slice(0, limit);
  if (!input.fiveSim || !wantsWhatsAppLookup(input.q) || page.some((row) => isWhatsAppService(row.service))) return page;
  const extra = input.offer && isWhatsAppService(input.offer.service) ? input.offer : null;
  return withWhatsAppService(page, extra);
}
