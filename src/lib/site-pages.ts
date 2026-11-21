/** Public website copy. Admin notes never belong in these objects. */

export const SITE_PAGES = [
  { slug: "terms", title: "Terms and Conditions", path: "/terms" },
  { slug: "privacy", title: "Privacy Policy", path: "/privacy" },
  { slug: "about", title: "About Us", path: "/about" },
  { slug: "faq", title: "Frequently Asked Questions", path: "/faq" },
  { slug: "refund", title: "Refund Policy", path: "/refund" },
  { slug: "how", title: "How It Works", path: "/how" },
  { slug: "help", title: "Help", path: "/help" },
  { slug: "footer", title: "Footer description", path: "" },
  { slug: "notices", title: "Website notices", path: "/notices" },
] as const;

export type SiteSlug = (typeof SITE_PAGES)[number]["slug"];

const ALLOWED = new Set(["p", "h2", "h3", "strong", "em", "b", "i", "ul", "ol", "li", "a", "br", "blockquote"]);

export function isSiteSlug(slug: string): slug is SiteSlug {
  return SITE_PAGES.some((page) => page.slug === slug);
}

export function pageDefaults(slug: string): { title: string; html: string } {
  const known = SITE_PAGES.find((page) => page.slug === slug);
  const title = known?.title || "Page";
  const html = DEFAULTS[slug] || "<p>This page has not been published yet.</p>";
  return { title, html };
}

const DEFAULTS: Record<string, string> = {
  terms: [
    "<p>VeriLogs sells digital services from a naira wallet: virtual numbers for SMS, data and other digital products.</p>",
    "<p>A waiting number that never receives a code can be cancelled. The amount returns to the wallet. Completed recharges are not refundable once the provider accepts them.</p>",
    "<p>Imported catalogues stay off until an admin enables them. Prices include the margin set in admin and, for dollar catalogues, the naira rate.</p>",
    "<p>Do not use a number to break the law or a platform’s rules. Accounts that do can be closed and the wallet held.</p>",
  ].join(""),
  privacy: [
    "<p>We store the name, email and phone you give us, plus wallet movements and orders, so the dashboard can show your numbers and receipts.</p>",
    "<p>Google sign-in links the Google address you choose. VeriLogs does not receive your Google password.</p>",
    "<p>Support tickets include whatever you type. Don’t put card numbers in a ticket.</p>",
  ].join(""),
  about: "<p>VeriLogs is a naira wallet for virtual SMS numbers, data and other digital services. Number Server 1, Server 2 and Server 3 stay separate. Wallet funding goes through Paystack.</p>",
  faq: "<p>These answers sit above the existing FAQ list. The questions already saved in Content and settings stay in that list.</p>",
  refund: "<p>A number that is still waiting for an SMS can be cancelled from Buy Number. The amount returns to the wallet. A completed purchase that the provider already accepted is not refunded from this page.</p>",
  how: "<p>Create an account, fund the wallet with Paystack, then choose a service. For a number, pick the server first, then the country and the service. Logs and VPN are a separate marketplace.</p>",
  help: "<p>Use Vera, the chat button, for common questions. For a person, open the Telegram channel linked in the chat. Sign in before asking about your own wallet or orders.</p>",
  footer: "<p>Virtual numbers, data and digital services. Wallet in naira. Servers stay separate.</p>",
  notices: "<p></p>",
};

export function sanitizeHtml(raw: string): string {
  let html = String(raw || "");
  html = html.replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/javascript:/gi, "");
  html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag: string, attrs: string) => {
    const name = tag.toLowerCase() === "b" ? "strong" : tag.toLowerCase() === "i" ? "em" : tag.toLowerCase();
    if (!ALLOWED.has(name) && name !== "strong" && name !== "em") return "";
    if (name === "br") return "<br>";
    if (full.startsWith("</")) return `</${name}>`;
    if (name === "a") {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const url = (href?.[2] || href?.[3] || "").trim();
      if (!/^https?:\/\//i.test(url) && !url.startsWith("/")) return "<a>";
      const safe = url.replace(/"/g, "");
      return '<a href="' + safe + '">';
    }
    return `<${name}>`;
  });
  return html.trim();
}

/** Drafts and admin notes are ignored. Unpublished or empty pages use the built-in copy. */
export function visiblePage(
  row: { title?: string; publicHtml?: string; published?: boolean } | null,
  slug: string,
): { title: string; html: string; source: "published" | "built-in" } {
  const fallback = pageDefaults(slug);
  const html = sanitizeHtml(row?.publicHtml || "");
  if (!row?.published || !html) return { title: fallback.title, html: fallback.html, source: "built-in" };
  return { title: String(row.title || fallback.title), html, source: "published" };
}
