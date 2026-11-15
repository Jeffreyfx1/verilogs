import { parseMoney } from "@/lib/money";

export const MAJOR_SERVICES = [
  "WhatsApp",
  "Telegram",
  "Facebook",
  "Instagram",
  "Threads",
  "Amazon",
  "Google",
  "YouTube",
  "Gmail",
  "TikTok",
  "Douyin",
  "OpenAI",
  "ChatGPT",
];

export function serviceAllowed(service: string, list: string[]) {
  const name = service.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (name.length < 3) return false;
  const source = list.length ? list : MAJOR_SERVICES;
  const keys = source
    .flatMap((item) => item.split(/[/|,]+/))
    .map((item) => item.toLowerCase().replace(/[^a-z0-9]+/g, ""))
    .filter((item) => item.length >= 3);
  return keys.some((key) => name === key || name.startsWith(key) || (key.startsWith(name) && name.length >= 4));
}

export type Category = "numbers" | "rent" | "airtime" | "data" | "cable" | "electricity" | "exam" | "giftcard" | "betting" | "boost" | "vpn" | "other";

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
  rate: number;
  rates: string;
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
const STOCK_KEYS = ["count", "stock", "qty", "Qty", "available", "quantity"];
const VALID_KEYS = ["month_validate", "validity", "duration", "days"];
const METRIC_KEYS = new Set([
  "price", "cost", "count", "qty", "quantity", "rate", "id", "stock", "amount", "category", "pos", "retail_price",
  "min", "max", "min_qty", "max_qty", "minimum", "maximum", "refill", "cancel", "dripfeed", "runs", "interval", "service",
]);
const META_KEYS = new Set([
  "status", "data", "message", "success", "result", "response", "payload", "items", "list",
  "plans", "packages", "services", "info", "error", "msg", "ok", "meta", "note", "content",
  "iso", "prefix", "text_en", "text_ru", "text", "slug", "emoji", "pos",
]);

const SERVICE_CANON: Record<string, string> = {
  whatsapp: "WhatsApp", whatsapp2: "WhatsApp2", telegram: "Telegram", "telegram 2.0": "Telegram 2.0",
  signal: "Signal", google: "Google", gmail: "Gmail", instagram: "Instagram", facebook: "Facebook",
  tiktok: "TikTok", twitter: "Twitter", discord: "Discord", snapchat: "Snapchat", amazon: "Amazon",
  netflix: "Netflix", apple: "Apple", microsoft: "Microsoft", uber: "Uber", bolt: "Bolt",
  paypal: "PayPal", binance: "Binance", steam: "Steam", tinder: "Tinder", outlook: "Outlook",
  yahoo: "Yahoo", viber: "Viber", wechat: "WeChat", line: "Line", linkedin: "LinkedIn",
  reddit: "Reddit", chatgpt: "ChatGPT", openai: "OpenAI", youtube: "YouTube", threads: "Threads",
  douyin: "Douyin", "1688": "1688", "163.com": "163.com", "115.com": "115.com", "11exch": "11exch",
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

const EXTRA_COUNTRIES: Record<string, string> = {
  antiguaandbarbuda: "Antigua and Barbuda", aruba: "Aruba", bahamas: "Bahamas", barbados: "Barbados",
  belize: "Belize", benin: "Benin", bhutane: "Bhutan", bih: "Bosnia and Herzegovina", bolivia: "Bolivia",
  botswana: "Botswana", burkinafaso: "Burkina Faso", burundi: "Burundi", capeverde: "Cape Verde", chad: "Chad",
  comoros: "Comoros", congo: "Congo", costarica: "Costa Rica", djibouti: "Djibouti", dominicana: "Dominican Republic",
  easttimor: "East Timor", ecuador: "Ecuador", equatorialguinea: "Equatorial Guinea", frenchguiana: "French Guiana",
  gabon: "Gabon", gambia: "Gambia", guadeloupe: "Guadeloupe", guatemala: "Guatemala", guinea: "Guinea",
  guineabissau: "Guinea-Bissau", guyana: "Guyana", haiti: "Haiti", honduras: "Honduras", jamaica: "Jamaica",
  lesotho: "Lesotho", liberia: "Liberia", luxembourg: "Luxembourg", macau: "Macau", madagascar: "Madagascar",
  malawi: "Malawi", maldives: "Maldives", mauritania: "Mauritania", mauritius: "Mauritius", mongolia: "Mongolia",
  montenegro: "Montenegro", namibia: "Namibia", newcaledonia: "New Caledonia", nicaragua: "Nicaragua",
  northmacedonia: "North Macedonia", oman: "Oman", panama: "Panama", papuanewguinea: "Papua New Guinea",
  paraguay: "Paraguay", puertorico: "Puerto Rico", reunion: "Reunion", rwanda: "Rwanda",
  saintkittsandnevis: "Saint Kitts and Nevis", saintlucia: "Saint Lucia",
  saintvincentandgrenadines: "Saint Vincent and the Grenadines", salvador: "El Salvador", samoa: "Samoa",
  seychelles: "Seychelles", sierraleone: "Sierra Leone", solomonislands: "Solomon Islands", suriname: "Suriname",
  swaziland: "Eswatini", tajikistan: "Tajikistan", tit: "Trinidad and Tobago", togo: "Togo",
  turkmenistan: "Turkmenistan", uruguay: "Uruguay", venezuela: "Venezuela",
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
  return COUNTRIES[squashed] || EXTRA_COUNTRIES[normalized] || EXTRA_COUNTRIES[squashed] || "";
}

export function isCountrySlug(key: string) {
  const name = key.trim().toLowerCase();
  return name === "any" || !!countryOf(name);
}

export function fiveSimCategoryUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { url: raw, product: "" };
  }
  if (!url.hostname.endsWith("5sim.net")) return { url: raw, product: "" };
  const parts = url.pathname.split("/").filter(Boolean);
  const at = parts.findIndex((part) => part === "products");
  const queryProduct = url.searchParams.get("product") || "";
  if (at < 0) return { url: raw, product: queryProduct };
  const first = (parts[at + 1] || "").toLowerCase();
  const second = (parts[at + 2] || "any").toLowerCase();
  if (!first || isCountrySlug(first)) return { url: raw, product: "" };
  const next = new URL("https://5sim.net/v1/guest/prices");
  next.searchParams.set("product", first);
  if (second !== "any" && isCountrySlug(second)) next.searchParams.set("country", second);
  return { url: next.toString(), product: first };
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
  if (/\b(rent|hosting)\b/.test(s)) return "rent";
  if (/\b(smm|boost|followers?|likes?|subscribers?)\b/.test(s)) return "boost";
  if (/\bvpn\b|proxy|wireguard|openvpn/.test(s)) return "";
  if (/\b(sms|otp|activation|numbers)\b/.test(s)) return "numbers";
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
  let price = parseMoney(pick(obj, PRICE_KEYS));
  const id = text(pick(obj, ID_KEYS));
  const serviceField = text(pick(obj, ["service", "platform", "app"]));
  let service = SERVICE_CANON[serviceField.toLowerCase()] || serviceField || ctx.service;
  if (/^\d+$/.test(service)) service = ownName || ctx.service || service;
  const countryRaw = text(pick(obj, ["country", "country_name", "geo"])) || ctx.country;
  const country = countryOf(countryRaw) || (COUNTRIES[countryRaw.toLowerCase()] ? COUNTRIES[countryRaw.toLowerCase()] : countryRaw);
  const blob = [ownName, service, text(pick(obj, ["network", "network_name", "sim", "network_code"])), ctx.network, ctx.operator].join(" ");
  const network = networkOf(blob) || ctx.network;
  const validity = text(pick(obj, VALID_KEYS));
  const stockRaw = parseMoney(pick(obj, STOCK_KEYS));
  const hint = text(pick(obj, ["category", "type", "kind", "section"])) || ctx.section;
  const operator = text(pick(obj, ["operator", "route"])) || ctx.operator;
  const minQ = parseMoney(pick(obj, ["min", "min_qty", "minimum"]));
  const maxQ = parseMoney(pick(obj, ["max", "max_qty", "maximum"]));
  const boostish = minQ != null || maxQ != null || /\b(smm|boost|followers?|likes?|views?|subscribers?|comments?)\b/i.test(`${hint} ${ownName} ${service}`);
  if ((price == null || price === 0) && boostish) {
    const rate = parseMoney(obj.rate ?? obj.Rate);
    if (rate != null && rate > 0 && rate < 100000 && !(stockRaw != null && stockRaw > 0 && countryOf(country))) price = rate;
  }
  if (!ownName && !id && !service && price == null) return null;
  if (price == null && !ownName && !service) return null;
  const display = ownName
    ? network && !networkOf(ownName) && (hint === "data" || ctx.section === "data")
      ? `${network} ${ownName}`
      : ownName
    : [service || "Number", country].filter(Boolean).join(" · ");
  const externalId = id ? slug([...path, id]) : slug([...path, hint, display, country, network, operator, String(price ?? "")]);
  const qty = minQ != null || maxQ != null ? `Min ${minQ ?? 0}${maxQ != null ? ` · Max ${maxQ}` : ""}` : "";
  return {
    externalId,
    name: display || ownName || id,
    service: service || ownName,
    country: countryOf(country) || country,
    network,
    operator,
    price: price ?? 0,
    stock: stockRaw == null ? 0 : Math.max(0, Math.round(stockRaw)),
    rate: Math.round(Number(obj.rate) || 0),
    rates: text(obj.rates),
    validity,
    variable: price == null || price === 0,
    description: [text(pick(obj, ["description", "desc", "plan_type", "type"])), qty, operator && operator !== display ? operator : ""].filter(Boolean).join(" · "),
    hint,
  };
}

function prettyCountry(raw: string) {
  const mapped = countryOf(raw);
  if (mapped) return mapped;
  if (!raw || raw.toLowerCase() === "any") return "";
  return raw.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function finalize(raw: Omit<ParsedItem, "category"> & { hint: string }): ParsedItem {
  const blob = `${raw.hint} ${raw.name} ${raw.service} ${raw.description} ${raw.network}`.toLowerCase();
  const hint = raw.hint.toLowerCase();
  const boost = hint === "boost" || hint === "smm" || /^(default|package|custom comments|mentions|subscriptions?|poll)$/.test(hint.trim()) || /\b(smm|boost|followers?|likes?|views?|subscribers?|comments?|watchtime|impressions?|retweets?)\b/.test(blob);
  const countryOk = !!countryOf(raw.country) || (!!raw.country && raw.country.toLowerCase() !== "any" && /^(any|virtual\d+)$/i.test(raw.operator.trim()));
  const rent = !boost && countryOk && (hint === "rent" || hint === "hosting" || /\b(hosting|rent)\b/.test(blob));
  const sms = !boost && countryOk && (rent || hint === "numbers" || hint === "activation" || /^(any|virtual\d+)$/i.test(raw.operator.trim()));
  const looksData = !sms && !boost && (hint === "data" || /data|\d+(\.\d+)?\s?(gb|mb)|bundle|sme|gifting|\bcg\b/.test(blob));
  let category: Category = "other";
  if (rent) category = "rent";
  else if (sms && (raw.operator || raw.stock > 0 || raw.rate > 0 || hint === "numbers")) category = "numbers";
  else if (/\b(exam|waec|neco|nabteb|jamb|result checker)\b/.test(blob) || hint === "exam") category = "exam";
  else if (/\b(electricity|electric|disco|ikedc|ekedc|aedc|phed|kedco|ibedc|kaedco|eedc)\b/.test(blob) || hint === "electricity") category = "electricity";
  else if (/\b(cable|dstv|gotv|startimes|cabletv)\b/.test(blob) || hint === "cable") category = "cable";
  else if (/\b(gift\s?cards?|giftcard|voucher)\b/.test(blob) || hint === "giftcard") category = "giftcard";
  else if (/\b(betting|sportbook|\bbet\b)\b/.test(blob) || hint === "betting") category = "betting";
  else if (hint === "airtime" || (/airtime|\bvtu\b/.test(blob) && !/\d+(\.\d+)?\s?(gb|mb)/.test(blob))) category = "airtime";
  else if (looksData && hint !== "numbers") category = "data";
  else if (boost) category = "boost";
  else if (/\bvpn\b|\bproxy\b|wireguard|openvpn/.test(blob) || hint === "vpn") category = "vpn";
  else if (raw.network) category = "data";
  const country = category === "numbers" || category === "rent" ? prettyCountry(raw.country) : raw.country && raw.country.toLowerCase() !== "any" ? prettyCountry(raw.country) : "";
  const network = raw.network || (category === "data" || category === "airtime" ? networkOf(raw.name) : "");
  const variable = (category === "airtime" || category === "electricity") && !(raw.price > 0);
  let name = raw.name;
  let service = raw.service;
  if ((category === "numbers" || category === "rent") && raw.service && country && !name.includes("·")) name = `${raw.service} · ${country}`;
  if ((category === "data" || category === "airtime") && network && !networkOf(name)) name = `${network} ${name}`;
  if (category === "cable" && raw.operator && !name.toLowerCase().includes(raw.operator.toLowerCase())) name = `${raw.operator} ${name}`;
  if (category === "boost" || category === "vpn" || category === "other") {
    const group = raw.hint.replace(/[_-]+/g, " ").trim();
    const generic = /^(default|package|custom comments|mentions|subscriptions?|other|boost|smm|activation|vpn|proxy)$/i.test(group);
    if (group && !generic && group.length < 48 && !/^\d+$/.test(group)) service = titleCase(group);
  }
  return { ...raw, category, name, service, country, network, variable, price: variable ? 0 : raw.price };
}

export type ImportKind = "numbers" | "vtu" | "vpn" | "smm" | "random";

function keptGroup(item: ParsedItem) {
  const group = item.service.trim();
  if (group && group !== item.name && group.length < 48) return group;
  return item.service || "General";
}

function networkLabel(name: string) {
  const low = name.trim().toLowerCase();
  if (low === "mtn") return "MTN";
  if (low === "airtel") return "Airtel";
  if (low === "glo") return "Glo";
  if (low === "9mobile" || low === "9 mobile" || low === "etisalat") return "9mobile";
  return name.trim();
}

export function airtimeProductsFromPayload(payload: unknown): ParsedItem[] {
  const nets = new Map<string, string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    const rawId = rec.network_id ?? rec.networkId;
    const rawName = rec.network_name ?? rec.networkName ?? rec.network;
    const id = typeof rawId === "number" || (typeof rawId === "string" && /^\d+$/.test(rawId)) ? String(rawId) : "";
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (id && name && !/^\d+$/.test(name)) nets.set(id, networkLabel(name));
    for (const value of Object.values(rec)) if (value && typeof value === "object") walk(value);
  };
  walk(payload);
  if (nets.has("1") && nets.has("2") && nets.has("4") && !nets.has("3") && ![...nets.values()].some((name) => name === "9mobile")) nets.set("3", "9mobile");
  return [...nets.entries()].map(([id, network]) => ({
    externalId: `airtime|${id}|${network.toLowerCase()}`,
    category: "airtime" as const,
    name: `${network} Airtime`,
    service: "Airtime",
    country: "Nigeria",
    network,
    operator: id,
    price: 0,
    stock: 0,
    rate: 0,
    rates: "",
    validity: "",
    variable: true,
    description: `Network ${id}. The customer chooses the amount.`,
  }));
}

export function shapeImport(items: ParsedItem[], kind: ImportKind, wanted: string[]) {
  if (kind === "random") {
    return items
      .filter((item) => !!(item.name || item.service))
      .map((item) => ({
        ...item,
        name: item.name || item.service,
        service: keptGroup(item) || item.service || "Other",
        variable: item.variable || !(item.price > 0),
      }));
  }
  const priced = items.filter((item) => !!item.name && (item.price > 0 || item.category === "airtime" || item.variable));
  if (kind === "numbers") {
    return priced.filter((item) => (item.category === "numbers" || item.category === "rent") && serviceAllowed(item.service || item.name, wanted));
  }
  if (kind === "vtu") {
    return priced
      .filter((item) => item.category !== "numbers" && item.category !== "rent" && item.category !== "boost")
      .map((item) => {
        if (item.category === "data" || item.category === "airtime" || item.category === "cable" || item.category === "electricity" || item.category === "exam") return item;
        const blob = `${item.name} ${item.service} ${item.description}`.toLowerCase();
        const category: Category = /\d+(\.\d+)?\s?(gb|mb)|bundle|\bdata\b/.test(blob) ? "data" : "airtime";
        return { ...item, category };
      });
  }
  if (kind === "vpn") {
    return priced
      .filter((item) => item.category !== "numbers" && item.category !== "rent")
      .map((item) => ({ ...item, category: "vpn" as const, service: keptGroup(item) || "VPN" }));
  }
  if (kind === "smm") {
    return priced
      .filter((item) => item.category !== "numbers" && item.category !== "rent")
      .map((item) => ({ ...item, category: "boost" as const, service: keptGroup(item) || "SMM" }));
  }
  return priced.map((item) => {
    if (item.category !== "other") return item;
    return { ...item, service: keptGroup(item) || item.service || "Other" };
  });
}

function isOperatorQuote(row: unknown): row is Record<string, unknown> {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const rec = row as Record<string, unknown>;
  if (Object.values(rec).some((value) => value && typeof value === "object")) return false;
  const cost = Number(rec.cost ?? rec.Price ?? rec.price);
  const count = Number(rec.count ?? rec.Qty ?? rec.qty ?? rec.stock);
  return Number.isFinite(cost) && Number.isFinite(count);
}

function isOperatorMap(node: unknown): node is Record<string, unknown> {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  const kids = Object.values(node as Record<string, unknown>).filter((value) => value && typeof value === "object");
  return kids.length > 0 && kids.every(isOperatorQuote);
}

function pushQuote(rows: Array<Record<string, unknown>>, service: string, country: string, operator: string, rec: Record<string, unknown>, hint: string) {
  const cost = Number(rec.cost ?? rec.Price ?? rec.price ?? 0);
  const count = Number(rec.count ?? rec.Qty ?? rec.qty ?? 0);
  if (!Number.isFinite(cost) || !Number.isFinite(count) || count <= 0 || cost <= 0) return;
  const windows: Array<[string, unknown]> = [
    ["1h", rec.rate1 ?? rec.rate],
    ["3h", rec.rate3],
    ["24h", rec.rate24],
    ["3d", rec.rate72],
    ["7d", rec.rate168],
    ["30d", rec.rate720],
  ];
  rows.push({
    id: `${country}|${service}|${operator}`,
    service,
    name: service,
    country,
    operator,
    cost,
    count: Math.round(count),
    rate: Math.round(Number(rec.rate ?? rec.rate1) || 0),
    rates: windows.filter(([, n]) => Number(n) > 0).map(([label, n]) => `${label} ${Math.round(Number(n))}%`).join(" · "),
    category: String(rec.Category || rec.category || hint || "activation"),
  });
}

export function slimFiveSim(payload: unknown, hint = "", allow: string[] = [], place: { country?: string; operator?: string } = {}): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const rows: Array<Record<string, unknown>> = [];
  const entries = Object.entries(payload as Record<string, unknown>).filter(([, value]) => value && typeof value === "object" && !Array.isArray(value));
  if (entries.length && entries.every(([, value]) => isOperatorQuote(value))) {
    const country = place.country || "";
    const operator = place.operator || "any";
    for (const [service, row] of entries) {
      if (allow.length && !serviceAllowed(service, allow)) continue;
      pushQuote(rows, service, country, operator, row as Record<string, unknown>, hint);
    }
    return rows;
  }
  let understood = false;
  for (const [top, nested] of entries) {
    const table = nested as Record<string, unknown>;
    const children = Object.entries(table).filter(([, value]) => value && typeof value === "object" && !Array.isArray(value));
    if (!children.length) continue;
    if (children.every(([, value]) => isOperatorMap(value))) {
      understood = true;
      if (allow.length && !serviceAllowed(top, allow)) continue;
      for (const [country, operators] of children) {
        for (const [operator, row] of Object.entries(operators as Record<string, unknown>)) {
          if (!isOperatorQuote(row)) continue;
          pushQuote(rows, top, country, operator, row, hint);
        }
      }
      continue;
    }
    understood = true;
    for (const [service, operators] of children) {
      if (!isOperatorMap(operators)) continue;
      if (allow.length && !serviceAllowed(service, allow)) continue;
      for (const [operator, row] of Object.entries(operators as Record<string, unknown>)) {
        if (!isOperatorQuote(row)) continue;
        pushQuote(rows, service, top, operator, row, hint);
      }
    }
  }
  return understood ? rows : payload;
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
    for (const key of Object.keys(obj)) {
      if (path.some((part) => META_KEYS.has(part.trim().toLowerCase()))) break;
      const value = obj[key];
      if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;
      const low = key.trim().toLowerCase();
      if (METRIC_KEYS.has(low) || META_KEYS.has(low)) continue;
      const next = childCtx(ctx, key);
      if (!next.service) continue;
      const raw = {
        externalId: slug([...path, key]),
        name: next.service,
        service: next.service,
        country: next.country,
        network: next.network,
        operator: next.operator,
        price: value,
        stock: 0,
        rate: 0,
        rates: "",
        validity: "",
        variable: false,
        description: "",
        hint: next.section || "activation",
      };
      const priced = finalize(raw);
      const pricedKey = [priced.externalId, priced.category, priced.country, priced.network, priced.operator].join("|");
      if (seen.has(pricedKey)) continue;
      seen.add(pricedKey);
      out.push(priced);
    }
    const raw = toRaw(obj, ctx, path);
    if (!raw) return;
    const ownPrice = parseMoney(pick(obj, PRICE_KEYS));
    const ownName = text(pick(obj, NAME_KEYS));
    if (nested.length > 0 && (ownPrice == null || !ownName)) return;
    const item = finalize(raw);
    if (!item.name) {
      skipped++;
      return;
    }
    const key = [item.externalId, item.category, item.country, item.network, item.operator].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  visit(payload, { section: "", service: "", country: "", network: "", operator: "" }, [], 0);
  return { items: out, skipped };
}
