import {
  freshData,
  ingest,
  normalizeData,
  quoteProduct,
  serverLabel,
  serverSlots,
  type Announcement,
  type Data,
  type Faq,
  type Note,
  type Order,
  type Settings,
  type Ticket,
  type User,
} from "@/lib/catalog";
import { attributeReferral, makeReferralCode } from "@/lib/referral";
import { uid } from "@/lib/money";
import { AIRTIME_CLOSED, BILL_CLOSED, SMM_CLOSED, airtimeSalesOpen, isRetiredBill, smmSalesOpen } from "@/lib/purchase-history";

export type Draft = { name: string; email: string };
export type SessionPatch = { userId?: string | null; draft?: Draft | null };

export async function hashPassword(pw: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("verilogs:" + pw));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function actor(data: Data, userId: string | null) {
  return data.users.find((u) => u.id === userId) ?? null;
}

function adminGuard(data: Data, userId: string | null) {
  const user = actor(data, userId);
  if (!user) return "Sign in first.";
  if (user.role !== "admin") return "Only an admin can do that.";
  return null;
}

function pushNote(data: Data, userId: string, title: string, body: string, kind: Note["kind"]): Data {
  const item: Note = { id: uid("ntf"), userId, title, body, read: false, createdAt: new Date().toISOString(), kind };
  return { ...data, notifications: [item, ...(data.notifications || [])].slice(0, 200) };
}

export function projectShop(doc: Data, userId: string | null, draft: Draft | null): Data {
  const clean = normalizeData(doc);
  const me = actor(clean, userId);
  const admin = me?.role === "admin";
  const strip = (u: User): User => ({ ...u, passwordHash: "", hasPassword: !!u.passwordHash });
  return {
    ...clean,
    paidRefs: [],
    sessionUserId: userId,
    googleDraft: draft,
    users: (admin ? clean.users : clean.users.filter((u) => u.id === userId)).map(strip),
    orders: admin ? clean.orders : clean.orders.filter((o) => o.userId === userId),
    txns: admin ? clean.txns : clean.txns.filter((t) => t.userId === userId),
    tickets: admin ? clean.tickets : clean.tickets.filter((t) => t.userId === userId),
    notifications: (clean.notifications || []).filter((n) => n.userId === userId),
    products: [],
    providers: (() => {
      const slots = serverSlots(clean.providers);
      return clean.providers.map((provider) => {
        const slot = slots.get(provider.id);
        const named = slot ? { ...provider, serverId: slot } : provider;
        return admin ? named : { ...named, name: provider.servesNumbers ? "" : provider.name, baseUrl: "" };
      });
    })(),
  };
}

export async function registerUser(data: Data, input: { name: string; email: string; phone: string; password: string; referralCode?: string }) {
  const clean = input.email.trim().toLowerCase();
  if (data.users.some((u) => u.email === clean)) return { error: "An account with that email already exists.", data };
  if (input.password.length < 8) return { error: "Use at least 8 characters.", data };
  if (input.phone.trim().length < 8) return { error: "Enter a real phone number.", data };
  const taken = new Set(data.users.map((user) => String(user.referralCode || "").toUpperCase()).filter(Boolean));
  const link = attributeReferral({ code: input.referralCode || "", email: clean, users: data.users });
  if (link.error) return { error: link.error, data };
  const user: User = {
    id: uid("usr"),
    name: input.name.trim(),
    email: clean,
    phone: input.phone.trim(),
    passwordHash: await hashPassword(input.password),
    google: false,
    role: "customer",
    balance: 0,
    createdAt: new Date().toISOString(),
    referralCode: makeReferralCode(input.name, taken, uid("ref")),
    referredBy: link.referrerId,
  };
  let next = { ...data, users: [...data.users, user] };
  next = pushNote(next, user.id, "Welcome to VeriLogs", "Your account is ready. Fund the wallet with Paystack, then buy a number, data or a bill.", "account");
  const admin = data.users.find((u) => u.role === "admin");
  if (admin) next = pushNote(next, admin.id, "New customer", `${user.name} · ${user.email}`, "account");
  return { error: null, data: next, userId: user.id, referrerId: user.referredBy || "", mail: { to: user.email, subject: "Welcome to VeriLogs", text: `Hi ${user.name}, your VeriLogs account is ready. Fund your naira wallet, then buy numbers, data or other digital services.` } };
}

export async function loginUser(data: Data, email: string, password: string) {
  const user = data.users.find((u) => u.email === email.trim().toLowerCase());
  if (!user || !user.passwordHash) return { error: "Email or password is incorrect.", data };
  if ((await hashPassword(password)) !== user.passwordHash) return { error: "Email or password is incorrect.", data };
  return { error: null, data, userId: user.id };
}

export function completeGoogle(data: Data, draft: Draft | null, input: { name: string; phone: string }) {
  if (!draft) return { error: "Start with Google again.", data };
  if (input.phone.trim().length < 8) return { error: "Enter the phone number on the account.", data };
  const existing = data.users.find((u) => u.email === draft.email);
  if (existing?.phone) {
    const users = data.users.map((u) => (u.id === existing.id ? { ...u, name: input.name.trim() || u.name, phone: input.phone.trim(), google: true } : u));
    return { error: null, data: { ...data, users }, userId: existing.id };
  }
  if (existing) {
    const users = data.users.map((u) => (u.id === existing.id ? { ...u, name: input.name.trim(), phone: input.phone.trim(), google: true } : u));
    return { error: null, data: pushNote({ ...data, users }, existing.id, "Google linked", "Your Google account is ready to buy.", "account"), userId: existing.id };
  }
  const user: User = {
    id: uid("usr"),
    name: input.name.trim() || draft.name,
    email: draft.email,
    phone: input.phone.trim(),
    passwordHash: "",
    google: true,
    role: "customer",
    balance: 0,
    createdAt: new Date().toISOString(),
  };
  let next = { ...data, users: [...data.users, user] };
  next = pushNote(next, user.id, "Welcome to VeriLogs", "Google sign-in is linked. Fund the wallet when you are ready to buy.", "account");
  return { error: null, data: next, userId: user.id, mail: { to: user.email, subject: "Welcome to VeriLogs", text: `Hi ${user.name}, your Google account is linked to VeriLogs.` } };
}

export function upsertGoogle(data: Data, profile: { email: string; name: string }) {
  const email = profile.email.trim().toLowerCase();
  const existing = data.users.find((u) => u.email === email);
  if (existing?.phone) return { data, userId: existing.id, needsPhone: false as const, draft: null as Draft | null };
  if (existing) return { data, userId: null, needsPhone: true, draft: { name: existing.name || profile.name, email } };
  return { data, userId: null, needsPhone: true, draft: { name: profile.name || email.split("@")[0], email } };
}

export async function resetPassword(data: Data, email: string, password: string) {
  const clean = email.trim().toLowerCase();
  const user = data.users.find((u) => u.email === clean);
  if (!user) return { error: "No account uses that email.", data };
  if (password.length < 8) return { error: "Use at least 8 characters.", data };
  const passwordHash = await hashPassword(password);
  const users = data.users.map((u) => (u.id === user.id ? { ...u, passwordHash } : u));
  const next = pushNote({ ...data, users }, user.id, "Password changed", "Your VeriLogs password was just updated. If this was not you, contact support.", "account");
  return { error: null, data: next, mail: { to: user.email, subject: "Your VeriLogs password changed", text: "Your password was just updated. If this was not you, write to support from the app." } };
}

export function updateProfile(data: Data, userId: string | null, input: { name: string; phone: string }) {
  const user = actor(data, userId);
  if (!user) return { error: "Sign in first.", data };
  if (input.phone.trim().length < 8) return { error: "Enter a real phone number.", data };
  const users = data.users.map((u) => (u.id === user.id ? { ...u, name: input.name.trim(), phone: input.phone.trim() } : u));
  return { error: null, data: { ...data, users } };
}

export async function changePassword(data: Data, userId: string | null, oldPw: string, nextPw: string) {
  const user = actor(data, userId);
  if (!user) return { error: "Sign in first.", data };
  if (nextPw.length < 8) return { error: "Use at least 8 characters.", data };
  if (user.passwordHash && (await hashPassword(oldPw)) !== user.passwordHash) return { error: "Old password is incorrect.", data };
  const passwordHash = await hashPassword(nextPw);
  const users = data.users.map((u) => (u.id === user.id ? { ...u, passwordHash } : u));
  return { error: null, data: { ...data, users } };
}

export function buyProduct(data: Data, userId: string | null, productId: string, extra: { phone?: string; amount?: number; detail?: string; cost?: number; gain?: number; code?: string; status?: Order["status"]; charge?: number; providerOrderId?: string; providerStatus?: string; refillAvailable?: boolean; delivery?: string; country?: string; service?: string; expiresAt?: string }) {
  const user = actor(data, userId);
  if (!user) return { error: "Sign in first.", data };
  const product = data.products.find((p) => p.id === productId && p.enabled);
  const provider = product && data.providers.find((p) => p.id === product.providerId && p.enabled);
  if (!product || !provider) return { error: "That service is not available.", data };
  if (!airtimeSalesOpen() && product.category === "airtime") return { error: AIRTIME_CLOSED, data };
  if (!smmSalesOpen() && product.category === "smm") return { error: SMM_CLOSED, data };
  if (isRetiredBill(product.category)) return { error: BILL_CLOSED, data };
  const face = product.variable ? Math.round(extra.amount || 0) : product.price;
  const amount = extra.charge && extra.charge > 0 ? Math.round(extra.charge) : face;
  if (product.category === "airtime" && (face < 50 || face > 50000)) return { error: "Airtime must be between ₦50 and ₦50,000.", data };
  if (!product.variable && amount <= 0) return { error: "This item has no price yet.", data };
  if (user.balance < amount) return { error: "Insufficient balance. Top up your balance to make this purchase.", data };
  const server = serverLabel(data.providers, provider.id) || provider.name;
  const cost = Math.max(0, Math.round(extra.cost ?? 0));
  const gain = Math.round(extra.gain ?? amount - cost);
  const number = product.category === "numbers" || product.category === "rent" || product.category === "number" || product.category === "usa";
  const order: Order = {
    id: uid("ord"),
    userId: user.id,
    productId: product.id,
    category: product.category,
    title: product.name,
    server,
    network: product.network,
    amount,
    phone: (extra.phone || "").trim(),
    code: extra.code || "",
    status: extra.status || (number ? "waiting" : "completed"),
    detail: extra.detail || product.description,
    cost,
    gain,
    createdAt: new Date().toISOString(),
    providerOrderId: extra.providerOrderId || "",
    providerStatus: extra.providerStatus || "",
    refillAvailable: !!extra.refillAvailable,
    delivery: extra.delivery || "",
    country: extra.country || product.country || "",
    service: extra.service || product.service || "",
    expiresAt: extra.expiresAt || "",
    messages: [],
  };
  let next: Data = {
    ...data,
    users: data.users.map((u) => (u.id === user.id ? { ...u, balance: u.balance - amount } : u)),
    orders: [order, ...data.orders],
    products: data.products.map((p) => (p.id === product.id && p.stock > 0 ? { ...p, stock: p.stock - 1 } : p)),
    txns: [{ id: uid("txn"), userId: user.id, kind: "purchase", amount: -amount, note: product.name, createdAt: order.createdAt }, ...data.txns],
  };
  next = pushNote(next, user.id, "Order placed", `${product.name} · ₦${amount.toLocaleString("en-NG")}`, "order");
  return { error: null, data: next };
}

export function recordAirtimeOrder(data: Data, userId: string | null, input: { networkId: string; title: string; providerId: string; network: string; phone: string; charge: number; cost: number; gain: number; ref: string }) {
  if (!airtimeSalesOpen()) return { error: AIRTIME_CLOSED, data };
  const user = actor(data, userId);
  if (!user) return { error: "Sign in first.", data };
  const provider = data.providers.find((item) => item.id === input.providerId && item.enabled);
  if (!provider) return { error: "That network is not available.", data };
  const amount = Math.round(input.charge);
  if (amount <= 0) return { error: "Enter an amount.", data };
  if (user.balance < amount) return { error: "Insufficient balance. Top up your balance to make this purchase.", data };
  const createdAt = new Date().toISOString();
  const order: Order = {
    id: uid("ord"),
    userId: user.id,
    productId: input.networkId,
    category: "airtime",
    title: input.title,
    server: serverLabel(data.providers, provider.id) || provider.name,
    network: input.network,
    amount,
    phone: input.phone.trim(),
    code: input.ref,
    status: "completed",
    detail: `${input.network} airtime`,
    cost: Math.max(0, Math.round(input.cost)),
    gain: Math.round(input.gain),
    createdAt,
    providerOrderId: "",
    providerStatus: "",
    refillAvailable: false,
  };
  const next = pushNote(
    {
      ...data,
      users: data.users.map((item) => (item.id === user.id ? { ...item, balance: item.balance - amount } : item)),
      orders: [order, ...data.orders],
      txns: [{ id: uid("txn"), userId: user.id, kind: "purchase" as const, amount: -amount, note: input.title, createdAt }, ...data.txns],
    },
    user.id,
    "Order placed",
    `${input.title} · ₦${amount.toLocaleString("en-NG")}`,
    "order",
  );
  return { error: null, data: next, order };
}

export function recordRentOrder(data: Data, userId: string | null, input: { offerId: string; title: string; country: string; service: string; kind: string; phone: string; charge: number; cost: number; gain: number; providerRef: string; providerStatus: string; providerUsd?: number; expiresAt?: string }) {
  const user = actor(data, userId);
  if (!user) return { error: "Sign in first.", data };
  const amount = Math.round(input.charge);
  if (amount <= 0) return { error: "This rental has no price yet.", data };
  if (user.balance < amount) return { error: "Insufficient balance. Top up your balance to make this purchase.", data };
  const phone = input.phone.trim();
  if (!phone) return { error: "The number service did not return a number. The wallet was not charged.", data };
  const createdAt = new Date().toISOString();
  const order: Order = {
    id: uid("ord"),
    userId: user.id,
    productId: input.offerId,
    category: "rent",
    title: input.title,
    server: "Rent number",
    network: input.kind,
    amount,
    phone,
    code: "",
    status: "waiting",
    detail: input.kind === "hosting" ? "Hosting rental" : "Activation",
    cost: Math.max(0, Math.round(input.cost)),
    gain: Math.round(input.gain),
    createdAt,
    providerOrderId: input.providerRef,
    providerStatus: input.providerStatus,
    expiresAt: input.expiresAt || "",
    country: input.country,
    service: input.service,
    providerUsd: input.providerUsd && input.providerUsd > 0 ? input.providerUsd : undefined,
    delivery: "",
    messages: [],
  };
  const next = pushNote(
    {
      ...data,
      users: data.users.map((item) => (item.id === user.id ? { ...item, balance: item.balance - amount } : item)),
      orders: [order, ...data.orders],
      txns: [{ id: uid("txn"), userId: user.id, kind: "purchase" as const, amount: -amount, note: input.title, createdAt }, ...data.txns],
    },
    user.id,
    "Order placed",
    `${input.title} · ₦${amount.toLocaleString("en-NG")}`,
    "order",
  );
  return { error: null, data: next, order };
}

export function refundOrder(data: Data, userId: string | null, orderId: string) {
  const user = actor(data, userId);
  const order = data.orders.find((o) => o.id === orderId && (user?.role === "admin" || o.userId === user?.id));
  if (!user || !order) return { error: "Order not found.", data };
  if (order.status !== "waiting") return { error: "Only a waiting number can be refunded.", data };
  const next = pushNote(
    {
      ...data,
      orders: data.orders.map((o) => (o.id === order.id ? { ...o, status: "refunded" as const, gain: 0 } : o)),
      users: data.users.map((u) => (u.id === order.userId ? { ...u, balance: u.balance + order.amount } : u)),
      txns: [{ id: uid("txn"), userId: order.userId, kind: "refund" as const, amount: order.amount, note: "Refund · " + order.title, createdAt: new Date().toISOString() }, ...data.txns],
    },
    order.userId,
    "Refund sent", `${order.title} is back in your wallet.`,
    "wallet",
  );
  return { error: null, data: next };
}

export function stampReferralCodes(data: Data) {
  const taken = new Set(data.users.map((user) => String(user.referralCode || "").toUpperCase()).filter(Boolean));
  let changed = false;
  const users = data.users.map((user) => {
    if (user.referralCode) return user;
    changed = true;
    const referralCode = makeReferralCode(user.name || user.email, taken, user.id.replace(/[^a-zA-Z0-9]/g, ""));
    taken.add(referralCode);
    return { ...user, referralCode };
  });
  return { data: changed ? { ...data, users } : data, changed };
}

export function tickWaiting(data: Data) {
  return data;
}

export function importServices(
  data: Data,
  userId: string | null,
  input: { providerId?: string; name: string; baseUrl: string; currency: "NGN" | "USD"; usdRate?: number; markup?: number; payload: unknown; hasKey?: boolean; publish?: boolean },
) {
  const denied = adminGuard(data, userId);
  if (denied) return { error: denied, data };
  const result = ingest(data, { ...input, enable: () => !!input.publish });
  return { error: null, data: result.data, report: result.report };
}

export function setEnabled(data: Data, userId: string | null, ids: string[], enabled: boolean) {
  const denied = adminGuard(data, userId);
  if (denied) return { error: denied, data };
  const setIds = new Set(ids);
  return { error: null, data: { ...data, products: data.products.map((p) => (setIds.has(p.id) ? { ...p, enabled } : p)) } };
}

export function editListing(data: Data, userId: string | null, id: string, patch: { description: string; price: number }) {
  const denied = adminGuard(data, userId);
  if (denied) return { error: denied, data };
  if (!id) return { error: "Choose a product.", data };
  const price = Math.round(Number(patch.price) || 0);
  if (price < 0) return { error: "Price cannot be negative.", data };
  return {
    error: null,
    data: {
      ...data,
      products: data.products.map((product) => product.id === id
        ? { ...product, description: patch.description, price: price > 0 ? price : product.price, variable: price > 0 ? false : product.variable }
        : product),
    },
  };
}

export function setProvider(data: Data, userId: string | null, id: string, patch: { enabled?: boolean; name?: string; usdRate?: number; markup?: number; markupPercent?: number; currency?: "NGN" | "USD"; operatorMarkups?: Record<string, number>; operatorPrices?: Record<string, number>; importType?: string; serverId?: string }) {
  const denied = adminGuard(data, userId);
  if (denied) return { error: denied, data };
  const providers = data.providers.map((p) => (p.id === id ? { ...p, ...patch } : p));
  const next = { ...data, providers };
  const products = data.products.map((product) => {
    if (product.providerId !== id || !(product.cost > 0) || product.variable) return product;
    const price = quoteProduct(product, next).price;
    return price > 0 && price !== product.price ? { ...product, price } : product;
  });
  return { error: null, data: { ...next, products } };
}

export function adjustBalance(data: Data, actorId: string | null, userId: string, amount: number, note: string) {
  const denied = adminGuard(data, actorId);
  if (denied) return { error: denied, data };
  const n = Math.round(amount);
  if (!n) return { error: "Enter an amount.", data };
  const user = data.users.find((u) => u.id === userId);
  if (!user) return { error: "Customer not found.", data };
  let next: Data = {
    ...data,
    users: data.users.map((u) => (u.id === userId ? { ...u, balance: Math.max(0, u.balance + n) } : u)),
    txns: [{ id: uid("txn"), userId, kind: n >= 0 ? "topup" as const : "purchase" as const, amount: n, note, createdAt: new Date().toISOString() }, ...data.txns],
  };
  next = pushNote(next, userId, n >= 0 ? "Wallet credited" : "Wallet adjusted", note, "wallet");
  return { error: null, data: next, mail: { to: user.email, subject: "VeriLogs wallet update", text: `${note}. Change: ₦${n.toLocaleString("en-NG")}.` } };
}

export function recordPaystackCredit(data: Data, input: { userId: string; amount: number; reference: string; balance: number; applied: boolean; ensureHistory?: boolean }) {
  const reference = String(input.reference || "").trim();
  const user = data.users.find((item) => item.id === input.userId);
  if (!user || !reference) return { data };
  const note = "Paystack · " + reference;
  const paidRefs = data.paidRefs.includes(reference) ? data.paidRefs : [...data.paidRefs, reference].slice(-5000);
  const hasTxn = data.txns.some((item) => item.userId === user.id && item.note === note);
  let next: Data = {
    ...data,
    paidRefs,
    users: data.users.map((item) => (item.id === user.id ? { ...item, balance: input.balance } : item)),
  };
  if ((input.applied || input.ensureHistory) && !hasTxn) {
    next = {
      ...next,
      txns: [{ id: "txn_" + reference.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 48), userId: user.id, kind: "topup", amount: Math.round(input.amount), note, createdAt: new Date().toISOString() }, ...next.txns],
    };
    next = pushNote(next, user.id, "Wallet funded", `Paystack added ₦${Math.round(input.amount).toLocaleString("en-NG")} to your wallet.`, "wallet");
    return { data: next, mail: { to: user.email, subject: "VeriLogs wallet funded", text: `Paystack confirmed ₦${Math.round(input.amount).toLocaleString("en-NG")}. Reference ${reference}.` } };
  }
  return { data: next };
}

export function creditVerified(data: Data, userId: string, amount: number, reference: string) {
  if (data.paidRefs.includes(reference)) return { data, already: true };
  const n = Math.round(amount);
  if (n < 100) return { data, error: "Amount too small." };
  const user = data.users.find((u) => u.id === userId);
  if (!user) return { data, error: "Account not found for this payment." };
  let next: Data = {
    ...data,
    paidRefs: [...data.paidRefs, reference].slice(-500),
    users: data.users.map((u) => (u.id === userId ? { ...u, balance: u.balance + n } : u)),
    txns: [{ id: uid("txn"), userId, kind: "topup" as const, amount: n, note: "Paystack · " + reference, createdAt: new Date().toISOString() }, ...data.txns],
  };
  next = pushNote(next, userId, "Wallet funded", `Paystack added ₦${n.toLocaleString("en-NG")} to your wallet.`, "wallet");
  return { data: next, mail: { to: user.email, subject: "VeriLogs wallet funded", text: `Paystack confirmed ₦${n.toLocaleString("en-NG")}. Reference ${reference}.` } };
}

export function addTicket(data: Data, userId: string | null, input: { email: string; subject: string; body: string }) {
  const ticket: Ticket = { id: uid("tkt"), userId: userId || "", email: input.email.trim(), subject: input.subject.trim(), body: input.body.trim(), createdAt: new Date().toISOString() };
  if (!ticket.subject || !ticket.body) return { error: "Write a subject and a message.", data };
  let next = { ...data, tickets: [ticket, ...data.tickets] };
  if (userId) next = pushNote(next, userId, "Support received", ticket.subject, "support");
  const admin = data.users.find((u) => u.role === "admin");
  if (admin) next = pushNote(next, admin.id, "New complaint", `${ticket.email}: ${ticket.subject}`, "support");
  return { error: null, data: next };
}

export function saveFaqs(data: Data, userId: string | null, faqs: Faq[]) {
  const denied = adminGuard(data, userId);
  if (denied) return { error: denied, data };
  return { error: null, data: { ...data, faqs } };
}

export function saveSettings(data: Data, userId: string | null, patch: Partial<Settings>) {
  const denied = adminGuard(data, userId);
  if (denied) return { error: denied, data };
  if (patch.logo && (!patch.logo.startsWith("data:image/") || patch.logo.length > 180000)) {
    return { error: "Use a small PNG, JPG or SVG under 120KB.", data };
  }
  const pictures = [patch.home?.image, ...(patch.home?.cards || []).map((card) => card.image)].filter(Boolean) as string[];
  if (pictures.some((img) => !img.startsWith("data:image/") || img.length > 180000)) {
    return { error: "Each homepage image must be a PNG, JPG or WebP under 120KB.", data };
  }
  const banners = patch.banners ? patch.banners.slice(0, 6) : data.settings.banners;
  const nextPatch = { ...patch };
  if (nextPatch.theme !== "light" && nextPatch.theme !== "dark") delete nextPatch.theme;
  for (const key of ["generalProfit", "airtimeProfit", "dataProfit", "referralReward", "referralMinPurchase"] as const) {
    if (nextPatch[key] == null) continue;
    const amount = Number(nextPatch[key]);
    if (!Number.isFinite(amount) || amount < 0 || amount > 10_000_000) return { error: "Enter a valid naira amount.", data };
    nextPatch[key] = Math.round(amount);
  }
  return { error: null, data: { ...data, settings: { ...data.settings, ...nextPatch, banners, home: { ...data.settings.home, ...patch.home }, popup: { ...data.settings.popup, ...patch.popup } } } };
}

export function addAnnouncement(data: Data, userId: string | null, title: string, body: string) {
  const denied = adminGuard(data, userId);
  if (denied) return { error: denied, data };
  if (!title.trim()) return { error: "Add a title.", data };
  const item: Announcement = { id: uid("ann"), title: title.trim(), body: body.trim(), createdAt: new Date().toISOString() };
  let next: Data = { ...data, announcements: [item, ...data.announcements] };
  for (const u of data.users) next = pushNote(next, u.id, item.title, item.body, "mail");
  const mails = data.users
    .filter((u) => u.role !== "admin" && u.email)
    .map((u) => ({ to: u.email, subject: item.title, text: item.body || item.title }));
  return { error: null, data: next, mails };
}

export function setAnnouncements(data: Data, userId: string | null, items: Announcement[]) {
  const denied = adminGuard(data, userId);
  if (denied) return { error: denied, data };
  const announcements = (Array.isArray(items) ? items : []).map((item) => ({
    id: String(item?.id || uid("ann")).slice(0, 64),
    title: String(item?.title || "").trim().slice(0, 160),
    body: String(item?.body || "").trim().slice(0, 4000),
    createdAt: item?.createdAt || new Date().toISOString(),
    active: item?.active !== false,
    startsAt: item?.startsAt ? String(item.startsAt).slice(0, 40) : undefined,
    endsAt: item?.endsAt ? String(item.endsAt).slice(0, 40) : undefined,
  })).filter((item) => item.title);
  return { error: null, data: { ...data, announcements } };
}

export function markNotes(data: Data, userId: string | null) {
  if (!userId) return data;
  return { ...data, notifications: data.notifications.map((n) => (n.userId === userId ? { ...n, read: true } : n)) };
}

export function resetShop() {
  return freshData();
}

export function mailUser(data: Data, actorId: string | null, userId: string, subject: string, body: string) {
  const denied = adminGuard(data, actorId);
  if (denied) return { error: denied, data };
  const user = data.users.find((u) => u.id === userId);
  if (!user) return { error: "Customer not found.", data };
  if (!subject.trim() || !body.trim()) return { error: "Write a subject and a message.", data };
  const next = pushNote(data, userId, subject.trim(), body.trim(), "mail");
  return { error: null, data: next, mail: { to: user.email, subject: subject.trim(), text: body.trim() } };
}
