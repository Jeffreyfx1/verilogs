import { extractCatalog, type ParsedItem } from "@/lib/categorize";
import { uid } from "@/lib/money";
import type { Category } from "@/lib/categorize";

export type Role = "customer" | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  google: boolean;
  role: Role;
  balance: number;
  createdAt: string;
  hasPassword?: boolean;
};

export type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  hasKey: boolean;
  servesNumbers: boolean;
  enabled: boolean;
  currency: "NGN" | "USD";
  usdRate: number;
  markup: number;
  createdAt: string;
  lastSync: {
    at: string;
    imported: number;
    created: number;
    updated: number;
    skipped: number;
    byCategory: Record<string, number>;
    byNetwork: Record<string, number>;
  } | null;
};

export type Product = {
  id: string;
  providerId: string;
  externalId: string;
  category: Category;
  name: string;
  service: string;
  country: string;
  network: string;
  price: number;
  cost: number;
  stock: number;
  enabled: boolean;
  validity: string;
  variable: boolean;
  description: string;
};

export type Order = {
  id: string;
  userId: string;
  productId: string;
  category: Category;
  title: string;
  server: string;
  network: string;
  amount: number;
  phone: string;
  code: string;
  status: "waiting" | "received" | "completed" | "refunded";
  detail: string;
  createdAt: string;
};

export type Txn = {
  id: string;
  userId: string;
  kind: "topup" | "purchase" | "refund";
  amount: number;
  note: string;
  createdAt: string;
};

export type Ticket = {
  id: string;
  userId: string;
  email: string;
  subject: string;
  body: string;
  createdAt: string;
};

export type Faq = { id: string; question: string; answer: string };
export type Announcement = { id: string; title: string; body: string; createdAt: string };
export type Banner = { id: string; title: string; body: string; href: string };
export type HomeCard = { id: string; title: string; body: string; image: string };
export type HomeCopy = { eyebrow: string; title: string; body: string; image: string; cards: HomeCard[] };
export type Note = {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  kind: "account" | "wallet" | "mail" | "order" | "support";
};

export type WelcomePopup = {
  enabled: boolean;
  title: string;
  body: string;
  whatsappTitle: string;
  whatsappBody: string;
  telegramTitle: string;
  telegramBody: string;
  button: string;
};

export type Settings = {
  usdNgn: number;
  margin: number;
  paystackPercent: number;
  paystackFlat: number;
  community: string;
  telegram: string;
  whatsapp: string;
  logo: string;
  brand: string;
  supportWelcome: string;
  home: HomeCopy;
  banners: Banner[];
  popup: WelcomePopup;
};

export type Data = {
  users: User[];
  sessionUserId: string | null;
  googleDraft: { name: string; email: string } | null;
  providers: Provider[];
  products: Product[];
  orders: Order[];
  txns: Txn[];
  tickets: Ticket[];
  faqs: Faq[];
  announcements: Announcement[];
  notifications: Note[];
  paidRefs: string[];
  settings: Settings;
};

export function defaultSettings(): Settings {
  return {
    usdNgn: 1650,
    margin: 12,
    paystackPercent: 0,
    paystackFlat: 0,
    community: "VeriLogs Community",
    telegram: "https://t.me/verilogs",
    whatsapp: "",
    logo: "",
    brand: "VeriLogs",
    supportWelcome: "Hi, I am Vera. Ask about numbers, data, your wallet, or how to reach the Telegram channel.",
    home: {
      eyebrow: "Trusted digital services",
      title: "Secure SMS verification, data and bills",
      body: "Get virtual numbers, airtime, data and bill payment from one naira wallet. Pick a server, fund the wallet, and the code or recharge shows up in your dashboard.",
      image: "",
      cards: [
        { id: "c1", title: "Virtual numbers", body: "SMS codes for WhatsApp, Telegram, Google and the other services you connect. Each API stays on its own server.", image: "" },
        { id: "c2", title: "Data and airtime", body: "MTN, Airtel, Glo, 9mobile and Smile stay as separate catalogues, with the price you set.", image: "" },
        { id: "c3", title: "Bills", body: "Cable, electricity and exam PINs from the same naira wallet.", image: "" },
      ],
    },
    banners: [
      { id: "b1", title: "Servers stay separate", body: "Each SMS API you connect becomes the next server. Prices and stock are never merged.", href: "/register" },
      { id: "b2", title: "SIMs stay apart", body: "MTN, Airtel, Glo, 9mobile and Smile are their own catalogues.", href: "/register" },
    ],
    popup: defaultPopup(),
  };
}

export function defaultPopup(): WelcomePopup {
  return {
    enabled: true,
    title: "Welcome to VeriLogs",
    body: "Fast SMS verification, wallet funding and digital services in one place.",
    whatsappTitle: "Join our WhatsApp",
    whatsappBody: "Get updates, support and important announcements.",
    telegramTitle: "Join our Telegram",
    telegramBody: "Follow the channel for rates, stock and notices.",
    button: "Start buying numbers",
  };
}

export function normalizeData(input: Partial<Data> | null | undefined): Data {
  const base = defaultSettings();
  const src = input ?? {};
  const incoming = src.settings;
  return {
    users: src.users ?? [],
    sessionUserId: src.sessionUserId ?? null,
    googleDraft: src.googleDraft ?? null,
    providers: (src.providers ?? []).map((provider) => {
      const five = /5sim/i.test(`${provider.name || ""} ${provider.baseUrl || ""}`);
      return {
        ...provider,
        usdRate: provider.usdRate > 0 ? provider.usdRate : five ? 2646 : base.usdNgn,
        markup: provider.markup > 0 ? provider.markup : five ? 1.6 : 1 + base.margin / 100,
      };
    }),
    products: src.products ?? [],
    orders: src.orders ?? [],
    txns: src.txns ?? [],
    tickets: src.tickets ?? [],
    faqs: src.faqs ?? [],
    announcements: src.announcements ?? [],
    notifications: src.notifications ?? [],
    paidRefs: src.paidRefs ?? [],
    settings: {
      ...base,
      ...incoming,
      home: {
        ...base.home,
        ...incoming?.home,
        cards: incoming?.home?.cards?.length ? incoming.home.cards : base.home.cards,
      },
      banners: incoming?.banners?.length ? incoming.banners : base.banners,
      logo: incoming?.logo ?? "",
      brand: incoming?.brand || base.brand,
      supportWelcome: incoming?.supportWelcome || base.supportWelcome,
      popup: { ...base.popup, ...incoming?.popup },
    },
  };
}

const SERVICES: Array<[string, number]> = [
  ["WhatsApp", 620], ["WhatsApp2", 740], ["Telegram", 380], ["Telegram 2.0", 460],
  ["Signal", 510], ["Google", 540], ["Gmail", 520], ["Instagram", 690],
  ["Facebook", 640], ["TikTok", 710], ["Twitter", 580], ["Discord", 490],
  ["Snapchat", 670], ["Amazon", 880], ["Netflix", 920], ["Apple", 990],
  ["Microsoft", 860], ["Uber", 730], ["Bolt", 700], ["PayPal", 1100],
  ["Binance", 980], ["Steam", 640], ["Tinder", 770], ["Outlook", 560],
  ["Yahoo", 430], ["Viber", 450], ["WeChat", 800], ["Line", 760],
  ["LinkedIn", 690], ["Reddit", 540], ["1688", 360], ["163.com", 340],
  ["115.com", 300], ["11exch", 1220], ["1xbet", 480], ["pof.com", 590],
];

const COUNTRIES: Array<[string, number]> = [
  ["nigeria", 0.62], ["usa", 1.35], ["england", 1.12], ["canada", 1.18],
  ["india", 0.5], ["germany", 1.22], ["indonesia", 0.58], ["kenya", 0.7],
  ["ghana", 0.68], ["brazil", 0.86], ["france", 1.28], ["south-africa", 0.8],
  ["netherlands", 1.16], ["philippines", 0.64], ["mexico", 0.9], ["poland", 0.95],
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function smsPayload(factor: number) {
  const sms: Record<string, Record<string, { cost: number; count: number; operator: string }>> = {};
  for (const [name, base] of SERVICES) {
    sms[name] = {};
    for (const [country, mult] of COUNTRIES) {
      const h = hash(name + country + String(factor));
      sms[name][country] = {
        cost: Math.max(120, Math.round((base * mult * factor) / 10) * 10),
        count: 40 + (h % 1800),
        operator: h % 2 ? "Virtual" + ((h % 40) + 1) : "Route" + ((h % 12) + 1),
      };
    }
  }
  return { sms };
}

const PLANS: Array<[string, number, string]> = [
  ["500MB", 220, "1 day"], ["1GB", 360, "1 day"], ["1.5GB", 490, "7 days"],
  ["2GB", 720, "30 days"], ["3GB", 1050, "30 days"], ["5GB", 1550, "30 days"],
  ["10GB", 2900, "30 days"], ["15GB", 4100, "30 days"], ["20GB", 5300, "30 days"],
  ["40GB", 9200, "30 days"], ["75GB", 14500, "30 days"], ["120GB", 21000, "30 days"],
];

export function vtuPayload() {
  const nets = ["MTN", "Airtel", "Glo", "9mobile", "Smile"] as const;
  const bump: Record<string, number> = { MTN: 1, Airtel: 1.04, Glo: 0.96, "9mobile": 0.92, Smile: 1.12 };
  const dataplans: Record<string, Array<Record<string, string | number>>> = {};
  for (const net of nets) {
    dataplans[net] = PLANS.map(([size, price, validity], i) => ({
      plan_id: `${net}-${i + 1}`,
      plan_name: `${size} data`,
      price: Math.round((price * (bump[net] ?? 1)) / 10) * 10,
      month_validate: validity,
      plan_type: i % 3 === 0 ? "SME" : i % 3 === 1 ? "Gifting" : "CG",
    }));
  }
  return {
    dataplans,
    airtime: nets.filter((n) => n !== "Smile").map((n) => ({ id: `airtime-${n}`, name: `${n} VTU Airtime`, network: n, category: "airtime" })),
    cables: {
      DStv: [["Padi", 2500], ["Yanga", 4200], ["Confam", 7400], ["Compact", 12500], ["Compact Plus", 19800], ["Premium", 29500]].map(
        ([name, price]) => ({ id: `dstv-${name}`, name, price }),
      ),
      GOtv: [["Smallie", 1300], ["Jinja", 2700], ["Jolli", 4200], ["Max", 6400]].map(([name, price]) => ({ id: `gotv-${name}`, name, price })),
      StarTimes: [["Nova", 1200], ["Basic", 2600], ["Smart", 3800], ["Super", 6500]].map(([name, price]) => ({ id: `star-${name}`, name, price })),
    },
    electricity: ["Ikeja Electric", "Eko Electric", "Abuja AEDC", "Ibadan IBEDC", "Port Harcourt PHED", "Kano KEDCO", "Enugu EEDC", "Kaduna KAEDCO"].map(
      (name, i) => ({ id: `disco-${i + 1}`, name, category: "electricity", description: "Prepaid and postpaid" }),
    ),
    exams: [
      { id: "waec", name: "WAEC Result Checker", price: 3500, category: "exam" },
      { id: "neco", name: "NECO Result Checker", price: 1500, category: "exam" },
      { id: "nabteb", name: "NABTEB Result Checker", price: 1200, category: "exam" },
      { id: "jamb", name: "JAMB PIN", price: 6200, category: "exam" },
    ],
  };
}

export function mixedPayload() {
  return { ...smsPayload(0.92), ...vtuPayload() };
}

export function sellPrice(cost: number, currency: "NGN" | "USD", rate: number, markup: number) {
  const ngn = currency === "USD" ? cost * (rate > 0 ? rate : 1) : cost;
  if (ngn <= 0) return 0;
  const factor = markup > 0 ? markup : 1;
  return Math.ceil((ngn * factor) / 5) * 5;
}

export function topupQuote(credit: number, settings: Pick<Settings, "paystackPercent" | "paystackFlat">) {
  const base = Math.round(Number(credit) || 0);
  const percent = Math.max(0, Number(settings.paystackPercent) || 0);
  const flat = Math.max(0, Math.round(Number(settings.paystackFlat) || 0));
  const fee = Math.round((base * percent) / 100) + flat;
  return { credit: base, fee, pay: base + fee };
}

export type SyncReport = {
  imported: number;
  created: number;
  updated: number;
  skipped: number;
  byCategory: Record<string, number>;
  byNetwork: Record<string, number>;
  providerId: string;
  serverLabel: string | null;
};

export function serverLabel(providers: Provider[], id: string) {
  const list = providers
    .filter((p) => p.servesNumbers)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name));
  const i = list.findIndex((p) => p.id === id);
  return i === -1 ? null : "Server " + (i + 1);
}

export function ingest(
  data: Data,
  input: {
    providerId?: string;
    name: string;
    baseUrl: string;
    hasKey?: boolean;
    currency: "NGN" | "USD";
    usdRate?: number;
    markup?: number;
    payload: unknown;
    enable?: (item: ParsedItem) => boolean;
  },
): { data: Data; report: SyncReport } {
  const extracted = extractCatalog(input.payload);
  const items = extracted.items;
  const now = new Date().toISOString();
  const providers = data.providers.map((p) => ({ ...p }));
  let provider = input.providerId ? providers.find((p) => p.id === input.providerId) : undefined;
  if (!provider) {
    provider = {
      id: uid("prov"),
      name: input.name,
      baseUrl: input.baseUrl,
      hasKey: !!input.hasKey,
      servesNumbers: false,
      enabled: true,
      currency: input.currency,
      usdRate: input.usdRate && input.usdRate > 0 ? input.usdRate : /5sim/i.test(input.name + input.baseUrl) ? 2646 : data.settings.usdNgn,
      markup: input.markup && input.markup > 0 ? input.markup : /5sim/i.test(input.name + input.baseUrl) ? 1.6 : 1 + data.settings.margin / 100,
      createdAt: now,
      lastSync: null,
    };
    providers.push(provider);
  } else {
    provider.name = input.name || provider.name;
    provider.baseUrl = input.baseUrl || provider.baseUrl;
    provider.currency = input.currency;
    if (input.usdRate && input.usdRate > 0) provider.usdRate = input.usdRate;
    if (input.markup && input.markup > 0) provider.markup = input.markup;
    if (!provider.usdRate) provider.usdRate = /5sim/i.test(provider.name + provider.baseUrl) ? 2646 : data.settings.usdNgn;
    if (!provider.markup) provider.markup = /5sim/i.test(provider.name + provider.baseUrl) ? 1.6 : 1 + data.settings.margin / 100;
    if (input.hasKey) provider.hasKey = true;
  }
  const products = data.products.map((p) => ({ ...p }));
  const byCategory: Record<string, number> = {};
  const byNetwork: Record<string, number> = {};
  let created = 0;
  let updated = 0;
  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1;
    if (item.network) byNetwork[item.network] = (byNetwork[item.network] || 0) + 1;
    const price = sellPrice(item.price, provider.currency, provider.usdRate, provider.markup);
    const existing = products.find((p) => p.providerId === provider!.id && p.externalId === item.externalId);
    if (existing) {
      existing.name = item.name;
      existing.service = item.service;
      existing.country = item.country;
      existing.network = item.network;
      if (item.price > 0) existing.cost = item.price;
      if (price > 0) existing.price = price;
      existing.stock = item.stock;
      existing.validity = item.validity;
      existing.variable = item.variable;
      existing.description = item.description;
      existing.category = item.category;
      updated++;
    } else {
      products.push({
        id: uid("prd"),
        providerId: provider.id,
        externalId: item.externalId,
        category: item.category,
        name: item.name,
        service: item.service,
        country: item.country,
        network: item.network,
        price,
        cost: item.price,
        stock: item.stock,
        enabled: input.enable ? input.enable(item) : false,
        validity: item.validity,
        variable: item.variable,
        description: item.description,
      });
      created++;
    }
  }
  provider.servesNumbers = products.some((p) => p.providerId === provider!.id && (p.category === "numbers" || p.category === "rent"));
  provider.lastSync = { at: now, imported: items.length, created, updated, skipped: extracted.skipped, byCategory, byNetwork };
  const next = { ...data, providers, products };
  return {
    data: next,
    report: {
      imported: items.length,
      created,
      updated,
      skipped: extracted.skipped,
      byCategory,
      byNetwork,
      providerId: provider.id,
      serverLabel: serverLabel(providers, provider.id),
    },
  };
}

export const CATEGORY_LABEL: Record<string, string> = {
  numbers: "Virtual numbers",
  rent: "Rent numbers",
  airtime: "Airtime",
  data: "Data",
  cable: "Cable TV",
  electricity: "Electricity",
  exam: "Exam PINs",
  giftcard: "Gift cards",
  betting: "Betting",
  other: "Other",
};

export const ADMIN_EMAIL = "verilogs@gmail.com";
export const ADMIN_PASSWORD_HASH = "37433eca0a2b03eb87e6ed9536e8a5cdd8557acc9bd16c47e99a0197f59f35dd";

export function withAdminLogin(doc: Data): Data {
  const hasAdmin = doc.users.some((u) => u.role === "admin");
  const users = hasAdmin
    ? doc.users.map((u) => (u.role === "admin" ? { ...u, email: ADMIN_EMAIL, passwordHash: ADMIN_PASSWORD_HASH } : u))
    : [
        {
          id: "usr_admin",
          name: "VeriLogs Admin",
          email: ADMIN_EMAIL,
          phone: "",
          passwordHash: ADMIN_PASSWORD_HASH,
          google: false,
          role: "admin" as const,
          balance: 0,
          createdAt: new Date().toISOString(),
        },
        ...doc.users,
      ];
  const same = users.length === doc.users.length && users.every((u, i) => u.email === doc.users[i]?.email && u.passwordHash === doc.users[i]?.passwordHash);
  return same ? doc : { ...doc, users };
}

export function repairCatalog(doc: Data): Data {
  let changed = false;
  const products: Product[] = [];
  for (const product of doc.products) {
    const label = `${product.service} ${product.name}`.trim().toLowerCase();
    if (/^(iso|prefix)\b/.test(label)) {
      changed = true;
      continue;
    }
    const rent = /\b(hosting|rent)\b/i.test(`${product.description} ${product.name}`);
    if ((product.category === "numbers" || product.category === "rent" || product.category === "other") && (!product.country || product.country === "Any")) {
      changed = true;
      continue;
    }
    const country = product.country === "Any" ? "" : product.country;
    let category = product.category;
    if (category === "other") category = rent ? "rent" : "numbers";
    else if (rent && category === "numbers") category = "rent";
    if (category !== product.category || country !== product.country || !(product.service || product.name)) {
      changed = true;
      products.push({ ...product, category, country, service: product.service || product.name });
    } else products.push(product);
  }
  const providers = doc.providers.map((provider) => {
    const five = /5sim/i.test(`${provider.name} ${provider.baseUrl}`);
    const usdRate = provider.usdRate > 0 ? provider.usdRate : five ? 2646 : doc.settings.usdNgn;
    const markup = provider.markup > 0 ? provider.markup : five ? 1.6 : 1 + doc.settings.margin / 100;
    const servesNumbers = products.some((p) => p.providerId === provider.id && (p.category === "numbers" || p.category === "rent"));
    if (usdRate !== provider.usdRate || markup !== provider.markup || servesNumbers !== provider.servesNumbers) {
      changed = true;
      return { ...provider, usdRate, markup, servesNumbers };
    }
    return provider;
  });
  const priced = products.map((product) => {
    const provider = providers.find((item) => item.id === product.providerId);
    if (!provider || !(product.cost > 0)) return product;
    const price = sellPrice(product.cost, provider.currency, provider.usdRate, provider.markup);
    if (price > 0 && price !== product.price) {
      changed = true;
      return { ...product, price };
    }
    return product;
  });
  if (!changed) return doc;
  return { ...doc, products: priced, providers };
}

export function isLive(product: Product, providers: Provider[]) {
  const provider = providers.find((p) => p.id === product.providerId);
  return product.enabled && !!provider?.enabled;
}

export function freshData(): Data {
  const settings = defaultSettings();
  let data: Data = {
    users: [{
      id: "usr_admin",
      name: "VeriLogs Admin",
      email: ADMIN_EMAIL,
      phone: "",
      passwordHash: ADMIN_PASSWORD_HASH,
      google: false,
      role: "admin",
      balance: 0,
      createdAt: "2026-01-04T10:00:00.000Z",
    }],
    sessionUserId: null,
    googleDraft: null,
    providers: [],
    products: [],
    orders: [],
    txns: [],
    tickets: [],
    faqs: [
      { id: "f1", question: "How do I get a verification code?", answer: "Fund your wallet with Paystack, open Virtual numbers, pick a server, choose the service and country, then buy. The number shows up immediately and the SMS code lands on the same card." },
      { id: "f2", question: "What if the SMS never arrives?", answer: "Cancel the waiting order from your active numbers. The naira goes straight back to your wallet." },
      { id: "f3", question: "Why are data plans split by network?", answer: "MTN, Airtel, Glo, 9mobile and Smile are separate SIM catalogues. Pick the network that matches the line you are recharging." },
      { id: "f4", question: "What is Server 1 and Server 2?", answer: "Each SMS or virtual-number API you connect becomes the next server. Server 1 is the first number API, Server 2 the second, and so on. Prices and stock stay separate." },
      { id: "f5", question: "How do I add money?", answer: "Open Fund wallet and pay with Paystack. The naira is added after Paystack confirms the charge. You also get an in-app notice, and an email when mail is connected." },
      { id: "f6", question: "How do I reach support?", answer: "Use the chat button at the bottom of the screen, or open the Telegram channel linked in Support." },
    ],
    announcements: [
      { id: "a1", title: "Pay with Paystack", body: "Wallet top-ups go through Paystack. The balance updates when the payment is confirmed.", createdAt: "2026-11-11T09:00:00.000Z" },
      { id: "a2", title: "Servers stay separate", body: "When you connect more than one SMS API, customers pick Server 1, Server 2 or Server 3. Nothing is merged.", createdAt: "2026-11-11T09:05:00.000Z" },
    ],
    notifications: [],
    paidRefs: [],
    settings,
  };
  return data;
}
