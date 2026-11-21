/** Retrieval and wording for Vera. No network and no secrets. */

export const VERA_CATEGORIES = [
  "General Verilogs Information",
  "Account and Registration",
  "Wallet and Deposits",
  "Number Services",
  "Logs and VPN",
  "Orders and Purchases",
  "Refunds and Disputes",
  "Referrals and Rewards",
  "Technical Troubleshooting",
  "Customer Support",
] as const;

const COUNTRIES: Array<[string, string]> = [
  ["united kingdom", "United Kingdom"],
  ["england", "United Kingdom"],
  ["uk", "United Kingdom"],
  ["united states", "United States"],
  ["usa", "United States"],
  ["nigeria", "Nigeria"],
  ["germany", "Germany"],
  ["india", "India"],
  ["indonesia", "Indonesia"],
  ["brazil", "Brazil"],
  ["ghana", "Ghana"],
  ["kenya", "Kenya"],
  ["south africa", "South Africa"],
];

const SERVICES: Array<[RegExp, string]> = [
  [/\b(whatsapp|watsapp|watapp|whats\s*app)\b/i, "whatsapp"],
  [/\b(telegram|tg)\b/i, "telegram"],
  [/\b(google|gmail)\b/i, "google"],
  [/\b(instagram|ig)\b/i, "instagram"],
  [/\b(facebook|fb)\b/i, "facebook"],
  [/\b(tiktok)\b/i, "tiktok"],
];

export function foldSpeech(raw: string) {
  return String(raw || "")
    .toLowerCase()
    .replace(/watsapp|watapp|whats\s*app/g, "whatsapp")
    .replace(/\b(no dey|e no show|e no enter|did not show|didn't show|not showing|no show|not reflect|has not entered|never entered)\b/g, " missing ")
    .replace(/\b(wetin|how far|abi|abeg|pls|plz)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mentionedCountry(text: string) {
  const low = ` ${foldSpeech(text)} `;
  for (const [key, name] of COUNTRIES) {
    const needle = ` ${foldSpeech(key)} `;
    if (needle.trim() && low.includes(needle)) return name;
  }
  return "";
}

export function mentionedService(text: string) {
  for (const [test, slug] of SERVICES) if (test.test(text)) return slug;
  return "";
}

const STOP = new Set(["the", "a", "an", "my", "is", "to", "do", "i", "how", "why", "what", "me", "of", "in", "it", "for", "and", "you", "your", "on", "please", "was", "are", "this", "that", "with", "from", "have", "has", "about", "just", "when", "where", "who", "which", "can", "not"]);

export function questionKey(text: string) {
  const words = foldSpeech(text).split(" ").filter((word) => word.length > 2 && !STOP.has(word));
  return [...new Set(words)].sort().join(" ");
}

export function retrieveKnowledge<T extends { title: string; body: string; category?: string }>(rows: T[], question: string, limit = 4): T[] {
  const tokens = foldSpeech(question).split(" ").filter((word) => word.length > 2 && !STOP.has(word));
  return rows
    .map((row) => {
      const hay = foldSpeech(`${row.category || ""} ${row.title} ${row.body}`);
      const score = tokens.reduce((sum, token) => sum + (hay.includes(token) ? 1 : 0), 0);
      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.row.title.localeCompare(b.row.title))
    .slice(0, limit)
    .map((item) => item.row);
}

export function wantsEscalation(text: string) {
  return /\b(human|person|agent|telegram|complaint|dispute|scam|charged twice|account (ban|banned|restricted|locked))\b/i.test(text);
}

export function stripUnanswered(text: string) {
  const unanswered = /\[\[UNANSWERED\]\]/i.test(text);
  return { unanswered, text: text.replace(/\[\[UNANSWERED\]\]/gi, "").trim() };
}

export function localVeraReply(input: {
  question: string;
  history: { role: string; body: string }[];
  knowledge: { title: string; body: string }[];
  facts: string;
  telegram: string;
  welcome: string;
}): { text: string; unanswered: boolean; escalate: boolean } {
  const prior = [...input.history].reverse().find((line) => line.role === "customer")?.body || "";
  const short = foldSpeech(input.question).split(" ").length <= 4;
  const search = short && prior ? `${prior} ${input.question}` : input.question;
  const folded = foldSpeech(search);
  const escalate = wantsEscalation(search);
  const telegram = input.telegram || "the Telegram channel";
  const hits = retrieveKnowledge(input.knowledge, search, 2);
  const lines: string[] = [];
  if (hits[0]) lines.push(hits[0].body.trim());
  if (/(wallet|money|balance)/.test(folded) && /missing|deposit|paystack|fund/.test(folded)) {
    if (/no wallet credit is recorded/i.test(input.facts)) lines.push("I cannot see a confirmed wallet credit on this account yet. A pending or failed Paystack payment does not enter the wallet. If you have a reference, a person on Telegram can check that payment.");
    else if (/Recent wallet credits:/i.test(input.facts)) lines.push("The wallet credits I can see are listed in your account. Only a successful Paystack confirmation is added. A later deposit does not repeat the first-deposit referral cashback.");
    else lines.push("Wallet money appears after Paystack confirms the payment. Pending and failed payments are not added. Sign in and open Fund wallet to see the top-up history.");
  }
  if (/stocked|no stocked|fiveSim Server 1/i.test(input.facts) && mentionedService(search)) {
    const fact = input.facts.split("\n").find((line) => /stocked|FiveSim/i.test(line));
    if (fact) lines.push(fact.trim());
  }
  if (/order/.test(folded) && /Recent orders:/i.test(input.facts)) {
    const fact = input.facts.split("\n").find((line) => line.startsWith("Recent orders:"));
    if (fact) lines.push(`${fact} I can only see orders on the signed-in account.`);
  }
  if (escalate) lines.push(`I can’t finish this one here. A person can help on Telegram: ${telegram}`);
  if (!lines.length) {
    return {
      text: `${input.welcome} If this needs a person, use Telegram: ${telegram}`,
      unanswered: true,
      escalate,
    };
  }
  return { text: lines.join("\n\n"), unanswered: false, escalate };
}

export const VERA_SEED: Array<{ id: string; category: (typeof VERA_CATEGORIES)[number]; title: string; body: string }> = [
  { id: "vk-general", category: "General Verilogs Information", title: "What VeriLogs is", body: "VeriLogs is a naira wallet for virtual SMS numbers, data and other digital services. Prices are in naira. Server 1, Server 2 and Server 3 are separate catalogues and must not be mixed." },
  { id: "vk-account", category: "Account and Registration", title: "Registration and login", body: "Customers register with name, email, phone and a password, or finish a Google sign-in. A referral code is optional. An invalid code is rejected. Signing in uses the same email and password. Vera cannot reset a password or change an account." },
  { id: "vk-wallet", category: "Wallet and Deposits", title: "Wallet funding", body: "Fund wallet starts a Paystack payment. The wallet receives the amount the customer chose after Paystack confirms success. Pending and failed payments do not qualify. The site charge, if any, is not added to the wallet. Vera must not invent a payment confirmation." },
  { id: "vk-numbers", category: "Number Services", title: "Number servers", body: "Buy Number has Server 1, Server 2 and Server 3. Server 1 is FiveSim at 5sim.net. Server 2 and Server 3 are different providers. A country and service on one server are not automatically available on another. USA numbers are a separate list, not Server 1." },
  { id: "vk-logs", category: "Logs and VPN", title: "Logs and VPN", body: "Logs and VPN is the marketplace for imported log products. The standalone VPN page is not a second shop. VPN plans are not sold from that shortcut." },
  { id: "vk-orders", category: "Orders and Purchases", title: "Orders", body: "Order history lists purchases on the signed-in account. A waiting number can still receive an SMS. Vera can describe the status she is given and must not invent an order." },
  { id: "vk-refunds", category: "Refunds and Disputes", title: "Refunds", body: "A waiting number with no SMS can be cancelled from Buy Number and the naira returns to the wallet. Vera must not promise a refund for a completed provider order or a payment dispute. Those go to Telegram." },
  { id: "vk-referrals", category: "Referrals and Rewards", title: "Referral rewards", body: "A customer who registers with a valid referral link can receive 5 percent of their first successful deposit in the wallet, once. Later deposits do not pay it again. The person who shared the code still receives the existing referral reward after a qualifying purchase. Vera must not change either amount." },
  { id: "vk-trouble", category: "Technical Troubleshooting", title: "Common problems", body: "If money is not showing, check that Paystack succeeded and the customer is on the same account. If a service is missing, it may be out of stock or past the usual list; WhatsApp on Server 1 is still sold when a stocked row exists. A missing SMS on a waiting number can be cancelled for a wallet refund." },
  { id: "vk-support", category: "Customer Support", title: "Human support", body: "When Vera cannot resolve a payment dispute, a missing transaction, a failed purchase, or an account restriction, she sends the customer to the existing Telegram channel. She does not change balances, approve deposits, or issue refunds herself." },
];
