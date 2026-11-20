import { ACCS_HOME, matchCategories, mergeDiscoveries, parseAccsZoneHtml, type DiscoveryReport, type LogoMatch } from "@/lib/logo-discover";
import { categoryUsage, latestDiscovery, listStoredLogos, logoMap, saveCategoryLogo, saveDiscovery, servicesCovered } from "@/lib/logo-rows.server";

const SAMPLE = ["facebook", "instagram", "tiktok", "threads", "telegram"];

function hostOk(url: string) {
  try {
    return new URL(url).hostname === "accszone.com";
  } catch {
    return false;
  }
}

const BLOCKED = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|\[?::1\]?)/i;

async function readPage(url: string, fetchImpl: typeof fetch, depth = 0) {
  if (depth > 1 || !hostOk(url)) return { ok: false as const, error: "Only accszone.com can be scanned.", html: "" };
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(12000) });
  } catch {
    return { ok: false as const, error: `${url} did not respond.`, html: "" };
  }
  if (res.status >= 300 && res.status < 400) {
    const next = res.headers.get("location") || "";
    const absolute = next.startsWith("http") ? next : new URL(next, url).toString();
    if (!hostOk(absolute)) return { ok: false as const, error: "The site redirected away from accszone.com.", html: "" };
    return readPage(absolute, fetchImpl, depth + 1);
  }
  if (!res.ok) return { ok: false as const, error: `${url} replied ${res.status}.`, html: "" };
  const html = await res.text();
  if (html.length > 3_000_000) return { ok: false as const, error: "The page was too large to scan.", html: "" };
  return { ok: true as const, error: "", html };
}

async function imageLooksReal(url: string, fetchImpl: typeof fetch) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || BLOCKED.test(parsed.hostname)) return false;
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Range: "bytes=0-64" }, redirect: "manual", signal: AbortSignal.timeout(8000) });
  } catch {
    return false;
  }
  if (res.status >= 300 && res.status < 400) return false;
  if (!res.ok && res.status !== 206) return false;
  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return true;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return true;
  const head = new TextDecoder().decode(bytes.slice(0, 64)).trim().toLowerCase();
  return head.startsWith("<svg") || head.startsWith("<?xml") || head.startsWith("riff");
}

export async function scanAccsZone(fetchImpl: typeof fetch = fetch) {
  const errors: string[] = [];
  const home = await readPage(ACCS_HOME, fetchImpl);
  if (!home.ok) {
    const report: DiscoveryReport = { source: ACCS_HOME, fetchedAt: new Date().toISOString(), categories: [], listings: [], moreLinks: 0, errors: [home.error], note: "Nothing was imported." };
    return { error: home.error, report, matches: [] as LogoMatch[] };
  }
  const parsed = [parseAccsZoneHtml(home.html)];
  const samples = parsed[0].categories.filter((item) => SAMPLE.some((name) => item.name.toLowerCase().includes(name))).slice(0, 5);
  for (const sample of samples) {
    const page = await readPage(sample.page, fetchImpl);
    if (!page.ok) {
      errors.push(page.error);
      continue;
    }
    parsed.push(parseAccsZoneHtml(page.html));
  }
  const merged = mergeDiscoveries(parsed);
  const usage = await categoryUsage();
  const report: DiscoveryReport = {
    source: ACCS_HOME,
    fetchedAt: new Date().toISOString(),
    ...merged,
    errors,
    note: "Category logos are the homepage menu images. Listing photos under /uploads/listing_logos/ are recorded and not imported as category logos. Extra category pages were limited to Facebook, Instagram, TikTok, Threads and Telegram.",
  };
  const matches = matchCategories(usage, merged.categories);
  await saveDiscovery(report, matches);
  return { error: null as string | null, report, matches };
}

export async function importCategoryLogos(input: { categories?: string[]; allHigh?: boolean; replace?: boolean }, fetchImpl: typeof fetch = fetch) {
  const latest = await latestDiscovery();
  if (!latest) return { error: "Scan AccsZone before importing.", imported: 0, skipped: 0, covered: 0, failed: [] as string[] };
  const wanted = new Set((input.categories || []).map((name) => name.trim()).filter(Boolean));
  const chosen = latest.matches.filter((item) => {
    if (!item.imageUrl) return false;
    if (input.allHigh) return item.status === "high";
    return wanted.has(item.category);
  });
  let imported = 0;
  let skipped = 0;
  const failed: string[] = [];
  const saved: string[] = [];
  for (const item of chosen) {
    if (item.status !== "high" && !input.replace) {
      skipped += 1;
      failed.push(`${item.category} needs approval.`);
      continue;
    }
    const verified = await imageLooksReal(item.imageUrl, fetchImpl);
    if (!verified) {
      skipped += 1;
      failed.push(`${item.category} image could not be verified.`);
      continue;
    }
    const result = await saveCategoryLogo({
      category: item.category,
      imageUrl: item.imageUrl,
      page: item.page,
      filename: item.filename,
      format: item.format,
      confidence: item.confidence,
      custom: false,
      verified: true,
      note: item.note,
      replace: !!input.replace,
    });
    if (!result.saved) {
      skipped += 1;
      failed.push(`${item.category}: ${result.reason}`);
      continue;
    }
    imported += 1;
    saved.push(item.category);
  }
  return { error: null as string | null, imported, skipped, covered: await servicesCovered(saved), failed };
}

export async function saveManualLogo(input: { category: string; imageUrl: string; replace?: boolean }, fetchImpl: typeof fetch = fetch) {
  const category = input.category.trim().slice(0, 80);
  const imageUrl = input.imageUrl.trim().slice(0, 500);
  if (!category) return { error: "Choose a category." };
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    return { error: "Enter an https image address." };
  }
  if (url.protocol !== "https:" || url.username || url.password) return { error: "The logo address must be https." };
  const verified = await imageLooksReal(url.toString(), fetchImpl);
  if (!verified) return { error: "That address did not return an image." };
  const filename = decodeURIComponent(url.pathname.split("/").pop() || "").slice(0, 180);
  const result = await saveCategoryLogo({
    category,
    imageUrl: url.toString(),
    page: "",
    filename,
    format: (filename.split(".").pop() || "").toLowerCase().slice(0, 8),
    confidence: 1,
    custom: true,
    verified: true,
    note: "Saved by an administrator.",
    replace: !!input.replace,
    sourceSite: url.hostname,
  });
  return result.saved ? { error: null as string | null } : { error: result.reason };
}

export async function refreshCategoryLogos(fetchImpl: typeof fetch = fetch) {
  const scanned = await scanAccsZone(fetchImpl);
  if (scanned.error || !scanned.report) return { error: scanned.error || "Scan failed.", updated: 0 };
  const stored = await listStoredLogos();
  let updated = 0;
  for (const row of stored) {
    if (row.custom) continue;
    const match = scanned.matches.find((item) => item.category === row.category && item.status === "high" && item.imageUrl);
    if (!match || match.imageUrl === row.imageUrl) continue;
    const verified = await imageLooksReal(match.imageUrl, fetchImpl);
    if (!verified) continue;
    const saved = await saveCategoryLogo({ ...match, category: row.category, custom: false, verified: true, replace: false, note: "Refreshed from AccsZone." });
    if (saved.saved) updated += 1;
  }
  return { error: null as string | null, updated };
}

export async function logoDesk() {
  const [usage, stored, latest, logos] = await Promise.all([categoryUsage(), listStoredLogos(), latestDiscovery(), logoMap()]);
  const matches = latest?.matches || matchCategories(usage, []);
  const storedByName = Object.fromEntries(stored.map((row) => [row.category, row]));
  const rows = matches.map((item) => ({ ...item, stored: storedByName[item.category] || null }));
  const named = new Set(rows.map((row) => row.category));
  for (const item of usage) {
    if (named.has(item.name)) continue;
    rows.push({ category: item.name, services: item.services, customImages: item.customImages, discoveredName: "", imageUrl: "", page: "", filename: "", format: "", confidence: 0, status: "none", note: "No AccsZone category matched.", stored: storedByName[item.name] || null });
  }
  return {
    rows,
    logos,
    discovered: latest?.report.categories.length || 0,
    listingImages: latest?.report.listings.length || 0,
    moreLinks: latest?.report.moreLinks || 0,
    errors: latest?.report.errors || [],
    note: latest?.report.note || "",
    fetchedAt: latest?.report.fetchedAt || "",
    missing: rows.filter((row) => !row.stored?.imageUrl).length,
    ambiguous: rows.filter((row) => row.status === "ambiguous").length,
    high: rows.filter((row) => row.status === "high").length,
    covered: await servicesCovered(stored.filter((row) => row.imageUrl).map((row) => row.category)),
  };
}
