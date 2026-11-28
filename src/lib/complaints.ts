/** Labels shared by the complaint pages. No database and no secrets. */

export const COMPLAINT_CATEGORIES = ["Order", "Wallet", "Number", "Payment", "Account", "Other"] as const;

export const COMPLAINT_STATUSES = ["new", "under_review", "awaiting_customer", "resolved"] as const;

export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];

export function isComplaintStatus(value: string): value is ComplaintStatus {
  return (COMPLAINT_STATUSES as readonly string[]).includes(value);
}

export function customerStatusLabel(status: string) {
  if (status === "under_review") return "Under Review";
  if (status === "awaiting_customer") return "Replied";
  if (status === "resolved") return "Resolved";
  return "Pending";
}

export function adminStatusLabel(status: string) {
  if (status === "new") return "New";
  if (status === "under_review") return "Under Review";
  if (status === "awaiting_customer") return "Awaiting Customer";
  if (status === "resolved") return "Resolved";
  return status;
}

export function statusTone(status: string) {
  if (status === "resolved") return "bg-emerald-50 text-emerald-800";
  if (status === "awaiting_customer") return "bg-sky-50 text-sky-900";
  if (status === "under_review") return "bg-[#E5F2F8] text-[#174C70]";
  return "bg-amber-50 text-amber-900";
}

export type ComplaintRow = {
  id: string;
  reference: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  category: string;
  body: string;
  orderRef: string;
  status: string;
  adminUnread: boolean;
  customerUnread: boolean;
  hasScreenshot: boolean;
  createdAt: string;
  updatedAt: string;
  lastReplyAt: string;
  adminReply: string;
};

export type ComplaintMessage = {
  id: string;
  role: "customer" | "admin";
  body: string;
  internal: boolean;
  createdAt: string;
};

export type ComplaintEvent = {
  id: string;
  fromStatus: string;
  toStatus: string;
  actorRole: string;
  note: string;
  createdAt: string;
};

export type ComplaintOrder = {
  id: string;
  title: string;
  status: string;
  amount: number;
  createdAt: string;
};

export type ComplaintDetail = {
  complaint: ComplaintRow;
  messages: ComplaintMessage[];
  events: ComplaintEvent[];
  order: ComplaintOrder | null;
  screenshot: string;
};

export type ComplaintStats = {
  total: number;
  fresh: number;
  unread: number;
  pending: number;
  awaiting: number;
  resolved: number;
};
