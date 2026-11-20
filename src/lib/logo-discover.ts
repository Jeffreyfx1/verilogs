/** AccsZone category logos. Listing photos are recorded and never used as a category logo. */

export const ACCS_HOME = "https://accszone.com/";
export const HIGH_CONFIDENCE = 0.85;

const STOP = new Set(["accounts", "account", "channels", "channel", "and", "the", "for", "sale", "buy"]);
const NOT_IMAGE = /\.(html?|php|json|xml|pdf|zip|csv|txt)(\?|$)/i;

export type DiscoveredCategory = {
  name: string;
  page: string;
  imageUrl: string;
  filename: string;
  format: string;
};

export type DiscoveredListing = {
  imageUrl: string;
  alt: string;
  category: string;
};

export type LogoMatch = {
  category: string;
  services: number;
  customImages: number;
  discoveredName: string;
  imageUrl: string;
  page: string;
  filename: string;
  format: string;
  confidence: number;
  status: "high" | "ambiguous" | "none";
  note: string;
};

export type DiscoveryReport = {
  source: string;
  fetchedAt: string;
  categories: DiscoveredCategory[];
  listings: DiscoveredListing[];
  moreLinks: number;
  errors: string[];
  note: string;
};

export function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function accsImageUrl(raw: string, listing: boolean) {
  const trimmed = decodeHtml(raw).trim();
  if (!trimmed.startsWith("https://accszone.com/uploads/")) return "";
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return "";
  }
  if (url.hostname !== "accszone.com" || url.username || url.password) return "";
  const path = decodeURIComponent(url.pathname);
  if (!path.startsWith("/uploads/") || NOT_IMAGE.test(path)) return "";
  const isListing = path.includes("/listing_logos/");
  if (isListing !== listing) return "";
  const safe = path.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `https://accszone.com${safe}`.slice(0, 500);
}

function fileBits(url: string) {
  const full = decodeURIComponent(url.split("/").pop() || "");
  const ext = (full.split(".").pop() || "").toLowerCase();
  const format = ext === "jpeg" || ext === "jfif" ? "jpg" : ext.slice(0, 8);
  return { filename: full.slice(0, 180), format };
}

export function parseAccsZoneHtml(html: string): Pick<DiscoveryReport, "categories" | "listings" | "moreLinks"> {
  const categories: DiscoveredCategory[] = [];
  const seen = new Set<string>();
  const mega = /<a href="(https:\/\/accszone\.com\/all_ads\/[^"]+)" class="mega-title">\s*<img src="([^"]+)" alt="([^"]*)" class="mega-title-img"[^>]*>\s*<span>([^<]+)<\/span>/gi;
  for (const match of html.matchAll(mega)) {
    const imageUrl = accsImageUrl(match[2] || "", false);
    const name = decodeHtml(match[4] || match[3] || "");
    const page = decodeHtml(match[1] || "");
    if (!imageUrl || !name || seen.has(page)) continue;
    seen.add(page);
    categories.push({ name, page, imageUrl, ...fileBits(imageUrl) });
  }
  const listings: DiscoveredListing[] = [];
  const listingSeen = new Set<string>();
  const imgs = /<img src="(https:\/\/accszone\.com\/uploads\/listing_logos\/[^"]+)" alt="([^"]*)"/gi;
  for (const match of html.matchAll(imgs)) {
    const imageUrl = accsImageUrl(match[1] || "", true);
    if (!imageUrl || listingSeen.has(imageUrl)) continue;
    listingSeen.add(imageUrl);
    const alt = decodeHtml(match[2] || "");
    const category = categories
      .filter((item) => alt.toLowerCase().startsWith(item.name.toLowerCase()))
      .sort((a, b) => b.name.length - a.name.length)[0]?.name || "";
    listings.push({ imageUrl, alt, category });
  }
  const moreLinks = (html.match(/az-more-count">\(\d+ more\)/gi) || []).length || (html.match(/view more \(\d+ more\)/gi) || []).length;
  return { categories, listings, moreLinks };
}

export function mergeDiscoveries(pages: Array<Pick<DiscoveryReport, "categories" | "listings" | "moreLinks">>): Pick<DiscoveryReport, "categories" | "listings" | "moreLinks"> {
  const categories: DiscoveredCategory[] = [];
  const seen = new Set<string>();
  const listings: DiscoveredListing[] = [];
  const listingSeen = new Set<string>();
  let moreLinks = 0;
  for (const page of pages) {
    moreLinks += page.moreLinks;
    for (const category of page.categories) {
      if (seen.has(category.page)) continue;
      seen.add(category.page);
      categories.push(category);
    }
  }
  for (const page of pages) {
    for (const listing of page.listings) {
      if (listingSeen.has(listing.imageUrl)) continue;
      listingSeen.add(listing.imageUrl);
      const category = listing.category || categories
        .filter((item) => listing.alt.toLowerCase().startsWith(item.name.toLowerCase()))
        .sort((a, b) => b.name.length - a.name.length)[0]?.name || "";
      listings.push({ ...listing, category });
    }
  }
  return { categories, listings, moreLinks };
}

function words(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}

export function brandTokens(name: string) {
  const tokens = words(name).filter((word) => !STOP.has(word) && word.length > 1);
  if (/\btwitter\b/i.test(name) && /\bx\b/i.test(name)) tokens.push("x");
  return [...new Set(tokens)];
}

function scoreCategory(category: string, discovered: DiscoveredCategory) {
  const tokens = brandTokens(discovered.name);
  const own = words(category).filter((word) => !STOP.has(word));
  if (!tokens.length || !own.length || own.includes("other") || own.includes("uncategorized")) return { score: 0, hits: [] as string[] };
  const hits = tokens.filter((token) => own.includes(token));
  if (!hits.length) return { score: 0, hits };
  if (own.join(" ") === tokens.join(" ")) return { score: 0.98, hits };
  if (own[0] && hits.includes(own[0]) && hits.length === tokens.length) return { score: 0.94, hits };
  if (hits.length === 1 && own[0] === hits[0]) return { score: 0.92, hits };
  if (hits.length >= 2) return { score: 0.9, hits };
  return { score: 0.72, hits };
}

export function matchCategories(categories: Array<{ name: string; services?: number; customImages?: number }>, discovered: DiscoveredCategory[]): LogoMatch[] {
  return categories.map((category) => {
    const ranked = discovered
      .map((item) => ({ item, ...scoreCategory(category.name, item) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.hits.length - a.hits.length || b.score - a.score || a.item.name.localeCompare(b.item.name));
    const best = ranked[0];
    const rival = ranked[1];
    const empty = {
      category: category.name,
      services: category.services || 0,
      customImages: category.customImages || 0,
      discoveredName: "",
      imageUrl: "",
      page: "",
      filename: "",
      format: "",
      confidence: 0,
      status: "none" as const,
      note: "No AccsZone category matched.",
    };
    if (!best) return empty;
    const tied = rival && rival.hits.length === best.hits.length && rival.score >= HIGH_CONFIDENCE && best.score >= HIGH_CONFIDENCE && rival.item.page !== best.item.page;
    const status = tied || best.score < HIGH_CONFIDENCE ? "ambiguous" : "high";
    return {
      ...empty,
      discoveredName: best.item.name,
      imageUrl: best.item.imageUrl,
      page: best.item.page,
      filename: best.item.filename,
      format: best.item.format,
      confidence: best.score,
      status: status === "high" && best.score >= HIGH_CONFIDENCE ? "high" : "ambiguous",
      note: tied ? `Also similar to ${rival?.item.name}. Needs approval.` : status === "high" ? "Ready to import." : "Needs approval.",
    };
  });
}

export function applyCategoryLogo<T extends { imageUrl?: string; subcategory?: string; name?: string; price?: number }>(row: T, logos: Record<string, string>): T {
  if (row.imageUrl) return row;
  const url = logos[(row.subcategory || "").trim()];
  return url ? { ...row, imageUrl: url } : row;
}

/** Names an admin can tick for the next import. Does not import or replace anything. */
export function selectableLogoCategories(rows: Array<{ category?: string; imageUrl?: string }>) {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const category = String(row.category || "").trim();
    if (!category || !String(row.imageUrl || "").trim() || seen.has(category)) continue;
    seen.add(category);
    names.push(category);
  }
  return names;
}

export function duplicateListingUrls(listings: DiscoveredListing[]) {
  const counts = new Map<string, number>();
  for (const listing of listings) counts.set(listing.imageUrl, (counts.get(listing.imageUrl) || 0) + 1);
  return [...counts.values()].filter((count) => count > 1).length;
}
