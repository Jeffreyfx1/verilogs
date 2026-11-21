import { useMemo } from "react";
import { create } from "zustand";
import { normalizeData, defaultSettings, serverSlots, type Announcement, type Data, type Faq, type Provider, type SyncReport } from "@/lib/catalog";
import { pullShop, shopAct } from "@/lib/shop-fns";

type ShopState = { error: string | null; state: Data; report: SyncReport | null; orderId?: string };

async function act(op: string, payload?: Record<string, unknown>): Promise<ShopState> {
  return shopAct({ data: { op, payload } });
}

type Actions = {
  ready: boolean;
  bootError: string | null;
  boot: (force?: boolean) => void;
  register: (input: { name: string; email: string; phone: string; password: string; remember?: boolean; referral?: string }) => Promise<string | null>;
  login: (email: string, password: string, remember?: boolean) => Promise<string | null>;
  logout: () => void;
  completeGoogle: (input: { name: string; phone: string }) => Promise<string | null>;
  resetPassword: (email: string, password: string) => Promise<string | null>;
  updateProfile: (input: { name: string; phone: string }) => Promise<string | null>;
  changePassword: (oldPw: string, next: string) => Promise<string | null>;
  buy: (productId: string, extra: { phone?: string; amount?: number; detail?: string }) => Promise<{ error: string | null; orderId: string }>;
  buyAirtime: (networkId: string, extra: { phone: string; amount: number }) => Promise<string | null>;
  refund: (orderId: string) => Promise<string | null>;
  tickWaiting: () => void;
  importPayload: (input: { providerId?: string; name: string; baseUrl: string; currency: "NGN" | "USD"; usdRate?: number; markup?: number; payload: unknown; hasKey?: boolean; publish?: boolean; apiKey?: string }) => Promise<SyncReport>;
  setEnabled: (ids: string[], enabled: boolean) => void;
  editListing: (id: string, description: string, price: number) => Promise<string | null>;
  setProvider: (id: string, patch: Partial<Pick<Provider, "enabled" | "name" | "usdRate" | "markup" | "markupPercent" | "currency" | "operatorMarkups" | "operatorPrices" | "importType" | "serverId">>) => void;
  adjustBalance: (userId: string, amount: number, note: string) => Promise<string | null>;
  addTicket: (input: { email: string; subject: string; body: string }) => Promise<string | null>;
  saveFaqs: (faqs: Faq[]) => void;
  saveSettings: (patch: Partial<Data["settings"]>) => Promise<string | null>;
  addAnnouncement: (title: string, body: string) => Promise<string | null>;
  setAnnouncements: (announcements: Announcement[]) => Promise<string | null>;
  setSubcategory: (id: string, subcategory: string) => Promise<string | null>;
  refillOrder: (orderId: string) => Promise<string | null>;
  markNotes: () => void;
  mailUser: (userId: string, subject: string, body: string) => Promise<string | null>;
  resetDemo: () => void;
  adopt: (state: Data) => void;
};

export type Store = Data & Actions;

let booted = false;
let rev = 0;
const purchaseKeys = new Map<string, string>();

export const useStore = create<Store>((set) => {
  const adopt = (state: Data) => set({ ...normalizeData(state), ready: true });
  const run = async (op: string, payload?: Record<string, unknown>) => {
    const mine = ++rev;
    const res = await act(op, payload);
    if (mine === rev) adopt(res.state);
    return res;
  };
  return {
    ...normalizeData({ settings: defaultSettings(), faqs: [], announcements: [] }),
    sessionUserId: null,
    ready: false,
    bootError: null,
    adopt: (state) => {
      rev += 1;
      adopt(state);
    },
    boot: (force = false) => {
      if ((booted && !force) || typeof window === "undefined") return;
      booted = true;
      set({ bootError: null });
      const mine = ++rev;
      const timer = window.setTimeout(() => {
        set((state) => (state.ready ? state : { bootError: "VeriLogs did not answer in time." }));
      }, 18000);
      void pullShop()
        .then((res) => {
          window.clearTimeout(timer);
          if (mine === rev) adopt(res.state);
          else set({ ready: true, bootError: null });
        })
        .catch(() => {
          window.clearTimeout(timer);
          set({ ready: true, bootError: null });
        });
    },
    register: async (input) => (await run("register", input)).error,
    login: async (email, password, remember = true) => (await run("login", { email, password, remember })).error,
    logout: () => void run("logout"),
    completeGoogle: async (input) => (await run("completeGoogle", input)).error,
    resetPassword: async (email, password) => (await run("resetPassword", { email, password })).error,
    updateProfile: async (input) => (await run("updateProfile", input)).error,
    changePassword: async (oldPw, next) => (await run("changePassword", { oldPw, next })).error,
    buy: async (productId, extra) => {
      const slot = `${productId}|${extra.phone || ""}|${extra.amount || ""}|${extra.detail || ""}`;
      let key = purchaseKeys.get(slot);
      if (!key) {
        key = crypto.randomUUID();
        purchaseKeys.set(slot, key);
      }
      const res = await run("buy", { productId, phone: extra.phone, amount: extra.amount, detail: extra.detail, idempotencyKey: key });
      if (!res.error || !/already processing|reconciliation|reconciled/i.test(res.error)) purchaseKeys.delete(slot);
      return { error: res.error, orderId: res.orderId || "" };
    },
    buyAirtime: async (networkId, extra) => {
      const slot = `airtime|${networkId}|${extra.phone}|${extra.amount}`;
      let key = purchaseKeys.get(slot);
      if (!key) {
        key = crypto.randomUUID();
        purchaseKeys.set(slot, key);
      }
      const res = await run("buyAirtime", { networkId, phone: extra.phone, amount: extra.amount, idempotencyKey: key });
      if (!res.error || !/already processing|reconciliation|reconciled/i.test(res.error)) purchaseKeys.delete(slot);
      return res.error;
    },
    refund: async (orderId) => (await run("refund", { orderId })).error,
    tickWaiting: () => void run("tick").catch(() => undefined),
    importPayload: async (input) => {
      const res = await run("import", input as Record<string, unknown>);
      if (res.error || !res.report) throw new Error(res.error || "Import failed");
      return res.report;
    },
    setEnabled: (ids, enabled) => void run("setEnabled", { ids, enabled }),
    editListing: async (id, description, price) => (await run("editListing", { id, description, price })).error,
    setProvider: (id, patch) => void run("setProvider", { id, ...patch }),
    adjustBalance: async (userId, amount, note) => (await run("adjustBalance", { userId, amount, note })).error,
    addTicket: async (input) => (await run("addTicket", input)).error,
    saveFaqs: (faqs) => void run("saveFaqs", { faqs }),
    saveSettings: async (patch) => (await run("saveSettings", { patch })).error,
    addAnnouncement: async (title, body) => (await run("addAnnouncement", { title, body })).error,
    setAnnouncements: async (announcements) => (await run("setAnnouncements", { announcements })).error,
    setSubcategory: async (id, subcategory) => (await run("setSubcategory", { id, subcategory })).error,
    refillOrder: async (orderId) => (await run("refill", { orderId })).error,
    markNotes: () => void run("markNotes"),
    mailUser: async (userId, subject, body) => (await run("mailUser", { userId, subject, body })).error,
    resetDemo: () => void run("reset"),
  };
});

export function useUser() {
  return useStore((s) => s.users.find((u) => u.id === s.sessionUserId) ?? null);
}

export function useServers() {
  const providers = useStore((s) => s.providers);
  return useMemo(() => {
    const slots = serverSlots(providers);
    const seen = new Set<string>();
    return providers
      .filter((provider) => {
        if (!slots.has(provider.id) || seen.has(provider.id)) return false;
        seen.add(provider.id);
        return provider.enabled !== false;
      })
      .sort((a, b) => Number(slots.get(a.id)) - Number(slots.get(b.id)) || (a.createdAt || "").localeCompare(b.createdAt || ""))
      .map((provider) => {
        const serverId = slots.get(provider.id) || provider.serverId;
        return { ...provider, serverId, label: `Server ${serverId}` };
      });
  }, [providers]);
}

export type { Product, Provider, Order, User } from "@/lib/catalog";
