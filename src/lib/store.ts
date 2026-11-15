import { useMemo } from "react";
import { create } from "zustand";
import { normalizeData, defaultSettings, type Announcement, type Data, type Faq, type Provider, type SyncReport } from "@/lib/catalog";
import { pullShop, shopAct } from "@/lib/shop-fns";

type ShopState = { error: string | null; state: Data; report: SyncReport | null };

async function act(op: string, payload?: Record<string, unknown>): Promise<ShopState> {
  return shopAct({ data: { op, payload } });
}

type Actions = {
  ready: boolean;
  boot: () => void;
  register: (input: { name: string; email: string; phone: string; password: string; remember?: boolean }) => Promise<string | null>;
  login: (email: string, password: string, remember?: boolean) => Promise<string | null>;
  logout: () => void;
  completeGoogle: (input: { name: string; phone: string }) => Promise<string | null>;
  resetPassword: (email: string, password: string) => Promise<string | null>;
  updateProfile: (input: { name: string; phone: string }) => Promise<string | null>;
  changePassword: (oldPw: string, next: string) => Promise<string | null>;
  buy: (productId: string, extra: { phone?: string; amount?: number; detail?: string }) => Promise<string | null>;
  refund: (orderId: string) => Promise<string | null>;
  tickWaiting: () => void;
  importPayload: (input: { providerId?: string; name: string; baseUrl: string; currency: "NGN" | "USD"; usdRate?: number; markup?: number; payload: unknown; hasKey?: boolean; publish?: boolean; apiKey?: string }) => Promise<SyncReport>;
  setEnabled: (ids: string[], enabled: boolean) => void;
  setProvider: (id: string, patch: Partial<Pick<Provider, "enabled" | "name" | "usdRate" | "markup" | "currency" | "operatorMarkups" | "operatorPrices">>) => void;
  adjustBalance: (userId: string, amount: number, note: string) => Promise<string | null>;
  addTicket: (input: { email: string; subject: string; body: string }) => Promise<string | null>;
  saveFaqs: (faqs: Faq[]) => void;
  saveSettings: (patch: Partial<Data["settings"]>) => Promise<string | null>;
  addAnnouncement: (title: string, body: string) => Promise<string | null>;
  markNotes: () => void;
  mailUser: (userId: string, subject: string, body: string) => Promise<string | null>;
  resetDemo: () => void;
  adopt: (state: Data) => void;
};

export type Store = Data & Actions;

let booted = false;
let rev = 0;

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
    adopt: (state) => {
      rev += 1;
      adopt(state);
    },
    boot: () => {
      if (booted || typeof window === "undefined") return;
      booted = true;
      set({ ready: true });
      const mine = ++rev;
      void pullShop()
        .then((res) => {
          if (mine === rev) adopt(res.state);
        })
        .catch(() => undefined);
    },
    register: async (input) => (await run("register", input)).error,
    login: async (email, password, remember = true) => (await run("login", { email, password, remember })).error,
    logout: () => void run("logout"),
    completeGoogle: async (input) => (await run("completeGoogle", input)).error,
    resetPassword: async (email, password) => (await run("resetPassword", { email, password })).error,
    updateProfile: async (input) => (await run("updateProfile", input)).error,
    changePassword: async (oldPw, next) => (await run("changePassword", { oldPw, next })).error,
    buy: async (productId, extra) => (await run("buy", { productId, phone: extra.phone, amount: extra.amount, detail: extra.detail })).error,
    refund: async (orderId) => (await run("refund", { orderId })).error,
    tickWaiting: () => void run("tick").catch(() => undefined),
    importPayload: async (input) => {
      const res = await run("import", input as Record<string, unknown>);
      if (res.error || !res.report) throw new Error(res.error || "Import failed");
      return res.report;
    },
    setEnabled: (ids, enabled) => void run("setEnabled", { ids, enabled }),
    setProvider: (id, patch) => void run("setProvider", { id, ...patch }),
    adjustBalance: async (userId, amount, note) => (await run("adjustBalance", { userId, amount, note })).error,
    addTicket: async (input) => (await run("addTicket", input)).error,
    saveFaqs: (faqs) => void run("saveFaqs", { faqs }),
    saveSettings: async (patch) => (await run("saveSettings", { patch })).error,
    addAnnouncement: async (title, body) => (await run("addAnnouncement", { title, body })).error,
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
  return useMemo(
    () =>
      providers
        .filter((p) => p.servesNumbers)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name))
        .map((p, i) => ({ ...p, label: "Server " + (i + 1) })),
    [providers],
  );
}

export type { Product, Provider, Order, User } from "@/lib/catalog";
