/**
 * Facebook Logs delivery. Other account types can add a profile beside this one.
 * Values are taken only from the provider string. A field that is not there is omitted.
 */

import type { AccountField, AccountGuide, ParsedAccount } from "@/lib/account-delivery";

export const FACEBOOK_HEADINGS = [
  "User ID (Login ID)",
  "Facebook Password",
  "2FA Key (Secret)",
  "Linked Email",
  "Linked Email Password",
] as const;

export const FACEBOOK_2FA_HEADING = "Links to get Code from 2fa-Key";
export const FACEBOOK_2FA_NOTE = "The 2FA key is used with a compatible authenticator to obtain this account's verification code.";
export const FACEBOOK_2FA_LINKS = ["https://2fa.vn", "https://2fa-auth.com"] as const;

type Slot = "login" | "password" | "totp" | "email" | "emailPassword";
type Expect = "uid" | "email" | "password" | "totp" | "url" | "cookie" | "login";
type Role = { slot: Slot | "ignore"; expect: Expect };

const HEADING: Record<Slot, (typeof FACEBOOK_HEADINGS)[number]> = {
  login: "User ID (Login ID)",
  password: "Facebook Password",
  totp: "2FA Key (Secret)",
  email: "Linked Email",
  emailPassword: "Linked Email Password",
};

const ORDER: Slot[] = ["login", "password", "totp", "email", "emailPassword"];

export function isFacebookAccount(text: string) {
  const value = String(text || "");
  if (!/\b(facebook|fb)\b/i.test(value)) return false;
  if (/\b(followers|likes|views|comments|shares|reactions|subscribers)\b/i.test(value) && !/\b(account format|password|2fa|uid|login|email)\b/i.test(value)) return false;
  return true;
}

export function parseFacebookAccounts(raw: string, hint = ""): ParsedAccount[] {
  const text = String(raw || "").trim();
  if (!text) return [];
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = fromJson(JSON.parse(text), hint);
      if (parsed.length) return parsed;
    } catch {
      /* Not JSON. Try the credential text. */
    }
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 1 && lines.every(labeledPair)) {
    const account = accountFromSlots(slotsFromPairs(lines));
    return account ? [account] : [];
  }
  return lines.map((line) => accountFromLine(line, hint)).filter((account): account is ParsedAccount => !!account);
}

function accountFromLine(line: string, hint: string): ParsedAccount | null {
  if (labeledPair(line)) return accountFromSlots(slotsFromPairs([line]));
  const pipes = (line.match(/\|/g) || []).length;
  const separator: ":" | "|" = pipes >= 2 ? "|" : ":";
  const parts = splitCredential(line, separator);
  const fitting = formatLists(hint).filter((labels) => formatFits(labels, parts));
  if (fitting[0]) return accountFromSlots(zipSlots(fitting[0], parts));
  return accountFromSlots(slotsFromShapes(parts));
}

function accountFromSlots(slots: Partial<Record<Slot, string>>): ParsedAccount | null {
  if (!slots.login && slots.email) {
    slots.login = slots.email;
    delete slots.email;
  }
  const fields: AccountField[] = [];
  for (const slot of ORDER) {
    const value = clean(slots[slot] || "");
    if (!value) continue;
    fields.push({ label: HEADING[slot], value });
  }
  if (!fields.length) return null;
  const guide: AccountGuide | undefined = slots.totp
    ? { heading: FACEBOOK_2FA_HEADING, note: FACEBOOK_2FA_NOTE, links: [...FACEBOOK_2FA_LINKS] }
    : undefined;
  return { fields, layout: "facebook", guide };
}

function zipSlots(labels: string[], parts: string[]): Partial<Record<Slot, string>> {
  const values = align(labels, parts);
  const slots: Partial<Record<Slot, string>> = {};
  rolesFor(labels).forEach((known, index) => {
    const value = clean(values[index] || "");
    if (!known || known.slot === "ignore" || !value || !matches(known.expect, value) || slots[known.slot]) return;
    slots[known.slot] = value;
  });
  return slots;
}

function formatFits(labels: string[], parts: string[]) {
  const values = align(labels, parts);
  if (values.length < labels.length) return false;
  const roles = rolesFor(labels);
  return labels.every((_, index) => {
    const known = roles[index];
    const value = clean(values[index] || "");
    if (!known) return false;
    if (!value) return true;
    return matches(known.expect, value);
  });
}

function align(labels: string[], parts: string[]) {
  if (parts.length <= labels.length) return parts;
  const last = rolesFor(labels)[labels.length - 1];
  if (last?.expect === "cookie" || last?.slot === "ignore") {
    return [...parts.slice(0, labels.length - 1), parts.slice(labels.length - 1).join(":")];
  }
  return parts.slice(0, labels.length);
}

function slotsFromShapes(parts: string[]): Partial<Record<Slot, string>> {
  const slots: Partial<Record<Slot, string>> = {};
  const used = new Set<number>();
  const take = (test: (value: string) => boolean) => {
    const index = parts.findIndex((part, place) => !used.has(place) && test(clean(part)));
    if (index < 0) return "";
    used.add(index);
    return clean(parts[index] || "");
  };
  const uid = take(isUid);
  const emails: string[] = [];
  for (let guard = 0; guard < 3; guard += 1) {
    const email = take(isEmail);
    if (!email) break;
    emails.push(email);
  }
  const totp = take(isTotp);
  parts.forEach((part, index) => {
    if (isUrl(clean(part)) || isCookie(clean(part)) || isLiveCode(clean(part))) used.add(index);
  });
  const passwords = parts.filter((part, index) => !used.has(index) && isPassword(clean(part))).map((part) => clean(part));
  if (uid) slots.login = uid;
  else if (emails[0]) slots.login = emails[0];
  if (totp) slots.totp = totp;
  if (emails.length >= 2) slots.email = emails[1];
  else if (uid && emails[0]) slots.email = emails[0];
  if (passwords.length === 1) slots.password = passwords[0];
  return slots;
}

function slotsFromPairs(lines: string[]): Partial<Record<Slot, string>> {
  const slots: Partial<Record<Slot, string>> = {};
  for (const line of lines) {
    const match = line.match(/^([^:]{1,40})\s:\s([\s\S]+)$/) || line.match(/^([^:]{1,40}):\s*([\s\S]+)$/);
    if (!match) continue;
    const known = slotOf(match[1] || "");
    const value = clean(match[2] || "");
    if (!known || known.slot === "ignore" || !value || !matches(known.expect, value) || slots[known.slot]) continue;
    slots[known.slot] = value;
  }
  return slots;
}

function labeledPair(line: string) {
  const match = line.match(/^([^:]{1,40})\s:\s([\s\S]+)$/) || line.match(/^([^:]{1,40}):\s*([\s\S]+)$/);
  if (!match) return false;
  const known = slotOf(match[1] || "");
  return !!known && known.slot !== "ignore" && !line.includes("|");
}

function formatLists(hint: string) {
  const flat = String(hint || "").replace(/`/g, " ");
  const start = flat.search(/account\s*format/i);
  const window = start >= 0 ? flat.slice(start) : flat;
  const body = window.split(/\bstep\s+1\b|\bkey features\b|\bimportant notes\b/i)[0] || window;
  const lists: string[][] = [];
  for (const piece of body.split(/\bOR\b/i)) {
    for (const candidate of piece.split(/\n/).map((item) => item.trim()).filter(Boolean)) {
      const labels = splitFormatLabels(candidate.replace(/^.*account\s*format\s*[:\-–]?\s*/i, ""));
      if (labels && labels.length >= 2) {
        lists.push(labels);
        break;
      }
    }
  }
  return lists;
}

function splitFormatLabels(line: string) {
  const cleaned = line.replace(/^[^A-Za-z0-9]+/, "").trim();
  if (!cleaned) return null;
  const rough = cleaned.includes("|") ? cleaned.split("|") : cleaned.split(/\s:\s|:/);
  const labels = rough.map((part) => part.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim()).filter(Boolean);
  if (labels.length < 2 || labels.some((label) => !slotOf(label))) return null;
  return labels;
}

function rolesFor(labels: string[]): Array<Role | null> {
  const parsed = labels.map((label) => slotOf(label));
  const hasLogin = parsed.some((item) => item?.slot === "login");
  if (hasLogin) return parsed;
  return parsed.map((item) => item?.slot === "email" ? { slot: "login", expect: "email" } : item);
}

function slotOf(label: string): Role | null {
  const name = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!name || name.length > 40) return null;
  if (/cookie|auth token|session/.test(name)) return { slot: "ignore", expect: "cookie" };
  if (/profile link|profile url|backup/.test(name)) return { slot: "ignore", expect: "url" };
  if (/email ?pass|mail ?pass|mailbox pass|linked email pass|recovery pass/.test(name)) return { slot: "emailPassword", expect: "password" };
  if (/facebook pass|fb pass|account pass|^password$|^pass$|user pass|login pass/.test(name)) return { slot: "password", expect: "password" };
  if (/2fa|two fa|totp|authenticator|secret key|auth key/.test(name)) return { slot: "totp", expect: "totp" };
  if (/linked email|recovery email|recovery mail|^mail$|^email$|email address|associated email/.test(name)) return { slot: "email", expect: "email" };
  if (/facebook email|fb email|login email/.test(name)) return { slot: "login", expect: "email" };
  if (/^uid$|facebook id|fb id|user id|login id/.test(name)) return { slot: "login", expect: "uid" };
  if (/username|user name|^login$|^id$/.test(name)) return { slot: "login", expect: "login" };
  return null;
}

function matches(expect: Expect, value: string) {
  if (expect === "email") return isEmail(value);
  if (expect === "uid") return isUid(value);
  if (expect === "totp") return isTotp(value);
  if (expect === "url") return isUrl(value);
  if (expect === "cookie") return isCookie(value) || value.length > 20;
  if (expect === "password") return isPassword(value);
  return isUid(value) || isEmail(value) || isUsername(value);
}

function splitCredential(line: string, separator: ":" | "|") {
  if (separator === "|") return line.split("|").map((part) => part.trim()).filter(Boolean);
  const raw = line.split(":");
  const out: string[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const current = raw[index] || "";
    const next = raw[index + 1] || "";
    if (/^\s*https?$/i.test(current) && next.trim().startsWith("//")) {
      out.push(`${current.trim()}:${next.trim()}`);
      index += 1;
      continue;
    }
    const trimmed = current.trim();
    if (/^[\[{]/.test(trimmed)) {
      out.push(raw.slice(index).join(":").trim());
      break;
    }
    out.push(trimmed);
  }
  return out.filter(Boolean);
}

function fromJson(value: unknown, hint: string): ParsedAccount[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => typeof item === "string" ? parseFacebookAccounts(item, hint) : fromJson(item, hint));
  }
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.accounts)) return fromJson(record.accounts, hint);
  if (Array.isArray(record.data)) return fromJson(record.data, hint);
  const slots: Partial<Record<Slot, string>> = {};
  for (const [key, item] of Object.entries(record)) {
    if (item == null || typeof item === "object") continue;
    const known = slotOf(key.replace(/[_-]+/g, " "));
    const text = clean(String(item));
    if (!known || known.slot === "ignore" || !text || !matches(known.expect, text) || slots[known.slot]) continue;
    slots[known.slot] = text;
  }
  const account = accountFromSlots(slots);
  return account ? [account] : [];
}

function clean(value: string) {
  const text = value.trim().replace(/^["']|["']$/g, "");
  if (!text || /^null$/i.test(text) || text === "-") return "";
  return text;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUid(value: string) {
  return /^\d{8,20}$/.test(value);
}

function isUsername(value: string) {
  return /^[A-Za-z0-9._-]{3,40}$/.test(value) && !isUid(value) && !isTotp(value);
}

function isTotp(value: string) {
  const compact = value.replace(/\s+/g, "");
  if (isLiveCode(compact)) return false;
  return /^[A-Za-z2-7]{16,64}$/.test(compact);
}

function isLiveCode(value: string) {
  return /^\d{6}$/.test(value.trim());
}

function isUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isCookie(value: string) {
  return value.length >= 100 || /^[\[{]/.test(value) || /c_user|datr=|xs=/.test(value);
}

function isPassword(value: string) {
  if (!value || isEmail(value) || isUrl(value) || isTotp(value) || isCookie(value) || isUid(value) || isLiveCode(value)) return false;
  return value.length >= 4 && value.length <= 80 && !/\s/.test(value);
}
