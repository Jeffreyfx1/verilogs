/** Instaking SMM API. https://instaking.ng/api — POST form fields, not another provider's client. */

import type { ParsedItem } from "@/lib/categorize";
import { inheritLogos, logoFromRecord } from "@/lib/logs-map";

export const INSTAKING_URL = "https://instaking.ng/api/v1";

const PLATFORMS: Array<{ label: string; start: RegExp }> = [
  { label: "Instagram", start: /^instagram\b/i },
  { label: "TikTok", start: /^tik\s?tok\b/i },
  { label: "YouTube", start: /^youtube\b/i },
  { label: "Facebook", start: /^facebook\b/i },
  { label: "X (Twitter)", start: /^(twitter|x)\b/i },
  { label: "Telegram", start: /^telegram\b/i },
  { label: "Snapchat", start: /^snapchat\b/i },
  { label: "Twitch", start: /^twitch\b/i },
  { label: "Audiomack", start: /^audiomack\b/i },
];

export function isInstakingHost(host: string) {
  return /(^|\.)instaking\.ng$/i.test(host.replace(/^www\./, ""));
}

/** Platform comes from Instaking's category field, not the service name. Unknown categories stay Other. */
export function platformFromCategory(category: string) {
  const head = String(category || "").trim().split(/\s[-–—→|/]\s/)[0]?.trim() || "";
  if (!head) return "Other";
  return PLATFORMS.find((platform) => platform.start.test(head))?.label || "Other";
}

export function instakingCurrency(value: unknown): "NGN" | "USD" | "" {
  const text = String(value || "").trim().toUpperCase();
  if (!text) return "";
  if (text.includes("NGN") || text.includes("NAIRA")) return "NGN";
  if (text.includes("USD")) return "USD";
  return "";
}

export type InstakingCall = {
  ok: boolean;
  status: number;
  body: unknown;
  error: string;
};

export async function instakingPost(key: string, fields: Record<string, string | number>, url = INSTAKING_URL): Promise<InstakingCall> {
  const form = new URLSearchParams();
  form.set("key", key);
  for (const [name, value] of Object.entries(fields)) {
    if (value == null || value === "") continue;
    form.set(name, String(value));
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
  } catch {
    return { ok: false, status: 0, body: null, error: "Instaking could not be reached." };
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const error = record && typeof record.error === "string" ? record.error : "";
  if (!res.ok || error) {
    return { ok: false, status: res.status, body, error: error || text.replace(/\s+/g, " ").trim().slice(0, 180) || `Instaking replied ${res.status}.` };
  }
  return { ok: true, status: res.status, body, error: "" };
}

/** Rate is per 1,000 except a Package, which is one fixed charge. Success rate is not this field. */
export function parseInstakingServices(payload: unknown): ParsedItem[] | null {
  if (!Array.isArray(payload) || !payload.length) return null;
  const first = payload[0];
  if (!first || typeof first !== "object" || !("service" in first) || !("rate" in first) || !("name" in first)) return null;
  const items: ParsedItem[] = [];
  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const service = String(record.service ?? "").trim();
    const name = String(record.name ?? "").trim();
    const type = String(record.type ?? "Default").trim() || "Default";
    const category = String(record.category ?? "").trim();
    const rate = Number(record.rate);
    const min = Math.max(0, Math.round(Number(record.min) || 0));
    const max = Math.max(0, Math.round(Number(record.max) || 0));
    if (!service || !name || !Number.isFinite(rate) || rate <= 0) continue;
    const packaged = /^package$/i.test(type);
    const unit = packaged ? rate : rate / 1000;
    const platform = platformFromCategory(category);
    const refill = record.refill === true || record.refill === "true" || record.refill === 1;
    items.push({
      externalId: service,
      category: "smm",
      name,
      service,
      country: "",
      network: platform,
      operator: type,
      price: unit,
      stock: 0,
      rate: -1,
      rates: "",
      validity: "",
      variable: false,
      description: [
        category && `Category: ${category}`,
        `Type: ${type}`,
        `Provider rate: ${rate} per ${packaged ? "package" : "1,000"}`,
        min ? `Minimum ${min}` : "",
        max ? `Maximum ${max}` : "",
        `Refill: ${refill ? "yes" : "no"}`,
      ].filter(Boolean).join("\n"),
      importType: "SMM_IMPORT",
      serverId: "",
      subcategory: platform,
      smmMin: min,
      smmMax: max,
      smmType: type,
      smmRefill: refill,
      imageUrl: logoFromRecord(record),
    });
  }
  const withLogos = inheritLogos(items.map((item) => ({ ...item, imageUrl: item.imageUrl || "", group: item.subcategory || item.network || "" })));
  return withLogos.length ? withLogos.map(({ group: _group, ...item }) => item) : null;
}

export type SmmOrderFields = {
  link?: string;
  quantity?: number;
  comments?: string;
  username?: string;
  min?: number;
  max?: number;
  posts?: number;
  delay?: number;
  answerNumber?: string;
};

export function readSmmDetail(detail: string, quantity = 0): SmmOrderFields {
  let parsed: SmmOrderFields = {};
  const text = String(detail || "").trim();
  if (text.startsWith("{")) {
    try {
      const value = JSON.parse(text) as SmmOrderFields;
      if (value && typeof value === "object") parsed = value;
    } catch {
      parsed = { link: text };
    }
  } else if (text) parsed = { link: text };
  if (!parsed.quantity && quantity > 0) parsed.quantity = quantity;
  return parsed;
}

const DELAYS = new Set([0, 5, 10, 15, 30, 60, 90]);

/** Only the parameters documented for that service type are sent. */
export function instakingOrderFields(type: string, service: string, input: SmmOrderFields): { error: string } | (Record<string, string | number> & { error?: never }) {
  const id = String(service || "").trim();
  if (!id) return { error: "This service has no Instaking id." };
  const kind = String(type || "Default").trim().toLowerCase();
  const link = String(input.link || "").trim();
  if (kind === "package") {
    if (!link) return { error: "Paste the link for this package." };
    return { action: "add", service: id, link };
  }
  if (kind === "custom comments") {
    const comments = String(input.comments || "").trim();
    if (!link) return { error: "Paste the link for these comments." };
    if (!comments) return { error: "Add the comments, one per line." };
    return { action: "add", service: id, link, comments };
  }
  if (kind === "subscriptions" || kind === "subscription") {
    const username = String(input.username || "").trim();
    const min = Math.round(Number(input.min) || 0);
    const max = Math.round(Number(input.max) || 0);
    const posts = Math.round(Number(input.posts) || 0);
    const delay = Math.round(Number(input.delay) || 0);
    if (!username) return { error: "Enter the username." };
    if (min <= 0 || max <= 0 || min > max) return { error: "Set a minimum and maximum quantity." };
    if (posts <= 0) return { error: "Enter how many new posts to cover." };
    if (!DELAYS.has(delay)) return { error: "Delay must be 0, 5, 10, 15, 30, 60 or 90 minutes." };
    return { action: "add", service: id, username, min, max, posts, delay };
  }
  if (kind === "poll") {
    const quantity = Math.round(Number(input.quantity) || 0);
    const answer = String(input.answerNumber || "").trim();
    if (!link) return { error: "Paste the link to the poll." };
    if (quantity <= 0) return { error: "Enter the quantity." };
    if (!answer) return { error: "Enter the poll answer number." };
    return { action: "add", service: id, link, quantity, answer_number: answer };
  }
  const quantity = Math.round(Number(input.quantity) || 0);
  if (!link) return { error: "Paste the link for this order." };
  if (quantity <= 0) return { error: "Enter the quantity." };
  return { action: "add", service: id, link, quantity };
}
