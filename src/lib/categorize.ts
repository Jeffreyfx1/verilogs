import { parseMoney } from "@/lib/money";

export type Category = "numbers" | "airtime" | "data" | "cable" | "electricity" | "exam" | "giftcard" | "betting" | "other";

export type ParsedItem = {
  externalId: string;
  category: Category;
  name: string;
  service: string;
  country: string;
  network: string;
  operator: string;
  price: number;
  stock: number;
  validity: string;
  variable: boolean;
  description: string;
};

export type CatalogExtract = { items: ParsedItem[]; skipped: number };

type Ctx = {
  section: Category | "";
  service: string;
  country: string;
  network: string;
  operator: string;
};

const NAME_KEYS = ["name", "plan_name", "plan", "service_name", "title", "package", "bundle_name", "product_name", "variation", "dataplan"];
const PRICE_KEYS = ["price", "plan_amount", "amount", "cost", "selling_price", "plan_price", "Price", "retail_price"];
const ID_KEYS = ["id", "plan_id", "dataplan_id", "service_id", "code", "external_id", "product_id", "slug", "variation_code", "plan_code"];
const STOCK_KEYS = ["count", "stock", "qty", "available", "quantity"];
const VALID_KEYS = ["month_validate", "validity", "duration", "days"];
const META_KEYS = new Set([
  "status", "data", "message", "success", "result", "response", "payload", "items", "list",
  "plans", "packages", "services", "info", "error", "msg", "ok", "meta", "note", "content",
]);

const SERVICE_CANON: Record<string, string> = {
  whatsapp: "WhatsApp", whatsapp2: "WhatsApp2", telegram: "Telegram", "telegram 2.0": "Telegram 2.0",
  signal: "Signal", google: "Google", gmail: "Gmail", instagram: "Instagram", facebook: "Facebook",
  tiktok: "TikTok", twitter: "Twitter", discord: "Discord", snapchat: "Snapchat", amazon: "Amazon",
  netflix: "Netflix", apple: "Apple", microsoft: "Microsoft", uber: "Uber", bolt: "Bolt",
  paypal: "PayPal", binance: "Binance", steam: "Steam", tinder: "Tinder", outlook: "Outlook",
  yahoo: "Yahoo", viber: "Viber", wechat: "WeChat", line: "Line", linkedin: "LinkedIn",
  reddit: "Reddit", "1688": "1688", "163.com": "163.com", "115.com": "115.com", "11exch": "11exch",
  "1xbet": "1xbet", "pof.com": "pof.com", "163com": "163.com",
};

const COUNTRIES: Record<string, string> = {
  nigeria: "Nigeria", ng: "Nigeria", usa: "United States", us: "United States",
  "united states": "United States", "unitedstates": "United States", america: "United States",
  uk: "United Kingdom", gb: "United Kingdom", england: "United Kingdom", "united kingdom": "United Kingdom",
  "unitedkingdom": "United Kingdom", britain: "United Kingdom", canada: "Canada",
  india: "India", germany: "Germany", france: "France", brazil: "Brazil",
  indonesia: "Indonesia", kenya: "Kenya", ghana: "Ghana", "south africa": "South Africa",
  southafrica: "South Africa", netherlands: "Netherlands", holland: "Netherlands", spain: "Spain",
  italy: "Italy", poland: "Poland", mexico: "Mexico", philippines: "Philippines",
  russia: "Russia", ukraine: "Ukraine", turkey: "Turkey", egypt: "Egypt",
  morocco: "Morocco", australia: "Australia", japan: "Japan", china: "China",
  afghanistan: "Afghanistan", albania: "Albania", algeria: "Algeria", angola: "Angola",
  argentina: "Argentina", armenia: "Armenia", austria: "Austria", azerbaijan: "Azerbaijan",
  bahrain: "Bahrain", bangladesh: "Bangladesh", belarus: "Belarus", belgium: "Belgium",
  bosnia: "Bosnia", bulgaria: "Bulgaria", cambodia: "Cambodia", cameroon: "Cameroon",
  chile: "Chile", colombia: "Colombia", croatia: "Croatia", cyprus: "Cyprus",
  czech: "Czechia", czechia: "Czechia", denmark: "Denmark", estonia: "Estonia",
  ethiopia: "Ethiopia", finland: "Finland", georgia: "Georgia", greece: "Greece",
  hongkong: "Hong Kong", "hong kong": "Hong Kong", hungary: "Hungary", ireland: "Ireland",
  israel: "Israel", ivorycoast: "Ivory Coast", "ivory coast": "Ivory Coast",
  jordan: "Jordan", kazakhstan: "Kazakhstan", kuwait: "Kuwait", kyrgyzstan: "Kyrgyzstan",
  laos: "Laos", latvia: "Latvia", lithuania: "Lithuania", malaysia: "Malaysia",
  moldova: "Moldova", mozambique: "Mozambique", myanmar: "Myanmar", nepal: "Nepal",
  norway: "Norway", pakistan: "Pakistan", peru: "Peru", portugal: "Portugal",
  qatar: "Qatar", romania: "Romania", saudiarabia: "Saudi Arabia", "saudi arabia": "Saudi Arabia",
  senegal: "Senegal", serbia: "Serbia", singapore: "Singapore", slovakia: "Slovakia",
  slovenia: "Slovenia", srilanka: "Sri Lanka", "sri lanka": "Sri Lanka", sweden: "Sweden",
  switzerland: "Switzerland", taiwan: "Taiwan", tanzania: "Tanzania", thailand: "Thailand",
  tunisia: "Tunisia", uganda: "Uganda", uzbekistan: "Uzbekistan", vietnam: "Vietnam",
  zambia: "Zambia", zimbabwe: "Zimbabwe", uae: "United Arab Emirates", emirates: "United Arab Emirates",
};

const NETWORKS: Array<{ name: string; test: RegExp }> = [
  { name: "MTN", test: /\bmtn\b/i },
  { name: "Airtel", test: /\bairtel\b/i },
  { name: "Glo", test: /\b(glo|globacom)\b/i },
  { name: "9mobile", test: /\b(9mobile|9 mobile|etisalat)\b/i },
  { name: "Smile", test: /\bsmile\b/i },
];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] != null && obj[key] !== "") return obj[key];
  }
  const lower = new Map(Object.keys(obj).map((key) => [key.toLowerCase(), obj[key]]));
  for (const key of keys) {
    const value = lower.get(key.toLowerCase());
    if (value != null && value !== "") return value;
  }
  return undefined;
}

function text(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

export function networkOf(blob: string): string {
  const padded = ` ${blob.replace(/[_./+-]+/g, " ")} `;
  for (const net of NETWORKS) if (net.test.test(padded)) return net.name;
  return "";
}

function countryOf(key: string): string {
  const normalized = key.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (COUNTRIES[normalized]) return COUNTRIES[normalized];
  const squashed = normalized.replace(/\s+/g, "");
  return COUNTRIES[squashed] || "";
}

function titleCase(s: string) {
  if (!s) return "";
  if (/[A-Z]/.test(s) && /[a-z]/.test(s)) return s;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function sectionOfKey(key: string): Category | "" {
  const s = key.toLowerCase().replace(/[_-]+/g, " ");
  if (SERVICE_CANON[s] || SERVICE_CANON[key.toLowerCase()]) return "";
  if (/\b(exam|waec|neco|nabteb|jamb|result checker|education)\b/.test(s)) return "exam";
  if (/\b(electricity|electric|disco|meter)\b/.test(s)) return "electricity";
  if (/\b(cables?|dstv|gotv|startimes|cabletv|tv)\b/.test(s)) return "cable";
  if (/\b(gift\s?cards?|giftcard|vouchers?)\b/.test(s)) return "giftcard";
  if (/\b(betting|bets?|sportbooks?)\b/.test(s)) return "betting";
  if (/\b(airtime|vtu)\b/.test(s) && !/\bdata\b/.test(s)) return "airtime";
  if (/\b(dataplans?|bundles?|dataplan)\b/.test(s) || s === "data" || s === "sme") return "data";
  if (/\b(sms|otp|activation|virtual|numbers)\b/.test(s)) return "numbers";
  return "";
}

function isOperatorKey(key: string) {
  const s = key.trim().toLowerCase();
  return s === "any" || /^(virtual|route|operator|op)\d+$/.test(s);
}

function looksLikeService(key: string): boolean {
  const s = key.trim().toLowerCase();
  if (!s || META_KEYS.has(s) || s.length > 40 || isOperatorKey(key)) return false;
  if (SERVICE_CANON[s]) return true;
  if (countryOf(s) || networkOf(s) || sectionOfKey(s)) return false;
  return /^[a-z0-9][a-z0-9 .+-]{1,32}$/i.test(key) && !/^\d+$/.test(s);
}

function childCtx(ctx: Ctx, key: string): Ctx {
  const next = { ...ctx };
  const low = key.trim().toLowerCase();
  if (!low || META_KEYS.has(low)) return next;
  const section = sectionOfKey(key);
  if (section) {
    next.section = section;
    if (section === "cable" && !/^cables?$/.test(low)) next.operator = key;
    return next;
  }
  const net = key.trim().length < 28 ? networkOf(key) : "";
  if (net && key.trim().length < 24 && !SERVICE_CANON[low]) {
    next.network = net;
    if (!next.section || next.section === "other") next.section = "data";
    return next;
  }
  const country = countryOf(key);
  if (country) {
    next.country = country;
    return next;
  }
  if (SERVICE_CANON[low]) {
    next.service = SERVICE_CANON[low];
    return next;
  }
  if (isOperatorKey(key)) {
    next.operator = key;
    return next;
  }
  if (!next.service && looksLikeService(key)) {
    next.service = titleCase(key.replace(/[-_]/g, " "));
    return next;
  }
  if (key.length < 40) next.operator = key;
  return next;
}

function slug(parts: string[]) {
  return parts.filter(Boolean).join("|").toLowerCase().replace(/\s+/g, "-").slice(0, 180);
}

function toRaw(obj: Record<string, unknown>, ctx: Ctx, path: string[]): (Omit<ParsedItem, "category"> & { hint: string }) | null {
  const ownName = text(pick(obj, NAME_KEYS));
  const price = parseMoney(pick(obj, PRICE_KEYS));
  const id = text(pick(obj, ID_KEYS));
  const serviceField = text(pick(obj, ["service", "platform", "app"]));
  const service = SERVICE_CANON[serviceField.toLowerCase()] || serviceField || ctx.service;
  const countryRaw = text(pick(obj, ["country", "country_name", "geo"])) || ctx.country;
  const country = countryOf(countryRaw) || (COUNTRIES[countryRaw.toLowerCase()] ? COUNTRIES[countryRaw.toLowerCase()] : countryRaw);
  const blob = [ownName, service, text(pick(obj, ["network", "network_name", "sim", "network_code"])), ctx.network, ctx.operator].join(" ");
  const network = networkOf(blob) || ctx.network;
  const validity = text(pick(obj, VALID_KEYS));
  const stockRaw = parseMoney(pick(obj, STOCK_KEYS));
  const hint = text(pick(obj, ["category", "type", "kind", "section"])) || ctx.section;
  const operator = text(pick(obj, ["operator", "route"])) || ctx.operator;
  if (!ownName && !id && !service && price == null) return null;
  if (price == null && !ownName && !service) return null;
  const display = ownName
    ? network && !networkOf(ownName) && (hint === "data" || ctx.section === "data")
      ? `${network} ${ownName}`
      : ownName
    : [service || "Number", country].filter(Boolean).join(" · ");
  const externalId = id ? slug([...path, id]) : slug([...path, hint, display, country, network, operator, String(price ?? "")]);
  return {
    externalId,
    name: display || ownName || id,
    service: service || ownName,
    country: countryOf(country) || country,
    network,
    operator,
    price: price ?? 0,
    stock: stockRaw == null ? 0 : Math.max(0, Math.round(stockRaw)),
    validity,
    variable: price == null || price === 0,
    description: [text(pick(obj, ["description", "desc", "plan_type", "type"])), operator && operator !== display ? operator : ""].filter(Boolean).join(" · "),
    hint,
  };
}

function finalize(raw: Omit<ParsedItem, "category"> & { hint: string }): ParsedItem {
  const blob = `${raw.hint} ${raw.name} ${raw.service} ${raw.description} ${raw.network}`.toLowerCase();
  const hint = raw.hint.toLowerCase();
  const looksData = hint === "data" || /data|\d+(\.\d+)?\s?(gb|mb)|bundle|sme|gifting|\bcg\b/.test(blob);
  let category: Category = "other";
  if (/\b(exam|waec|neco|nabteb|jamb|result checker)\b/.test(blob) || hint === "exam") category = "exam";
  else if (/\b(electricity|electric|disco|ikedc|ekedc|aedc|phed|kedco|ibedc|kaedco|eedc)\b/.test(blob) || hint === "electricity") category = "electricity";
  else if (/\b(cable|dstv|gotv|startimes|cabletv)\b/.test(blob) || hint === "cable") category = "cable";
  else if (/\b(gift\s?cards?|giftcard|voucher)\b/.test(blob) || hint === "giftcard") category = "giftcard";
  else if (/\b(betting|sportbook|\bbet\b)\b/.test(blob) || hint === "betting") category = "betting";
  else if (hint === "airtime" || (/airtime|\bvtu\b/.test(blob) && !/\d+(\.\d+)?\s?(gb|mb)/.test(blob))) category = "airtime";
  else if (looksData && hint !== "numbers") category = "data";
  else if (hint === "numbers" || (raw.country && raw.service && !raw.network)) category = "numbers";
  else if (raw.network) category = "data";
  else if (raw.country && raw.service) category = "numbers";
  const network = raw.network || (category === "data" || category === "airtime" ? networkOf(raw.name) : "");
  const variable = category === "airtime" || category === "electricity";
  let name = raw.name;
  if (category === "numbers" && raw.service && raw.country && !name.includes("·")) name = `${raw.service} · ${raw.country}`;
  if ((category === "data" || category === "airtime") && network && !networkOf(name)) name = `${network} ${name}`;
  if (category === "cable" && raw.operator && !name.toLowerCase().includes(raw.operator.toLowerCase())) name = `${raw.operator} ${name}`;
  return { ...raw, category, name, network, variable: variable || raw.price <= 0, price: variable ? 0 : raw.price };
}

export function extractCatalog(payload: unknown): CatalogExtract {
  const out: ParsedItem[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  const visit = (node: unknown, ctx: Ctx, path: string[], depth: number) => {
    if (depth > 16 || node == null) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) visit(node[i], ctx, path, depth + 1);
      return;
    }
    const obj = asRecord(node);
    if (!obj) return;
    const nested = Object.keys(obj).filter((key) => obj[key] && typeof obj[key] === "object");
    for (const key of nested) visit(obj[key], childCtx(ctx, key), [...path, key], depth + 1);
    const raw = toRaw(obj, ctx, path);
    if (!raw) return;
    const ownPrice = parseMoney(pick(obj, PRICE_KEYS));
    const ownName = text(pick(obj, NAME_KEYS));
    if (nested.length > 0 && (ownPrice == null || !ownName)) return;
    const item = finalize(raw);
    if (item.name.length < 2) {
      skipped++;
      return;
    }
    const key = [item.externalId, item.category, item.country, item.network].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  visit(payload, { section: "", service: "", country: "", network: "", operator: "" }, [], 0);
  return { items: out, skipped };
}
