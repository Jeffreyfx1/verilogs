import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Wallet,
  Hash,
  Smartphone,
  Radio,
  Receipt,
  Megaphone,
  History,
  ScrollText,
  UserRound,
  LifeBuoy,
  LogOut,
  Menu,
  X,
  Download,
  Package,
  Users,
  Settings,
  Store,
  Flag,
  Crown,
  Shield,
  LayoutGrid,
  Globe,
} from "lucide-react";
import { Logo } from "@/components/ui";
import { NoticeBell } from "@/components/bell";
import { AnnounceBar } from "@/components/announce-bar";
import { naira } from "@/lib/money";
import { useStore, useUser } from "@/lib/store";

type Item = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  search?: { server: string; country: string; kind: string; service: string };
  hash?: string;
  match?: string;
};

export function AppShell({ admin, children }: { admin?: boolean; children: ReactNode }) {
  const user = useUser();
  const logout = useStore((s) => s.logout);
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => String(s.location.hash || "").replace(/^#/, "") });
  const search = useRouterState({ select: (s) => s.location.search as { country?: string; kind?: string } });
  const [open, setOpen] = useState(false);
  if (!user) return null;

  const userNav: Item[] = [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true, match: "dash" },
    { to: "/dashboard/wallet", label: "Fund wallet", icon: Wallet },
    { to: "/dashboard/numbers", label: "All countries", icon: Globe, search: { server: "", country: "", kind: "", service: "" }, match: "all" },
    { to: "/dashboard/numbers", label: "USA numbers", icon: Flag, search: { server: "", country: "United States", kind: "", service: "" }, match: "usa" },
    { to: "/dashboard/numbers", label: "Rent numbers", icon: Crown, search: { server: "", country: "", kind: "rent", service: "" }, match: "rent" },
    { to: "/dashboard/numbers", label: "Rent USA numbers", icon: Shield, search: { server: "", country: "United States", kind: "rent", service: "" }, match: "rent-usa" },
    { to: "/dashboard/data", label: "Data", icon: Radio },
    { to: "/dashboard/airtime", label: "Airtime", icon: Smartphone },
    { to: "/dashboard/bills", label: "Bills", icon: Receipt },
    { to: "/dashboard/extra", label: "SMM", icon: Megaphone, hash: "smm", match: "smm" },
    { to: "/dashboard/extra", label: "Random", icon: LayoutGrid, hash: "random", match: "random" },
    { to: "/dashboard/vpn", label: "VPN", icon: Shield },
    { to: "/dashboard/announcements", label: "Announcements", icon: Megaphone },
  ];
  const historyNav: Item[] = [
    { to: "/dashboard/history", label: "Numbers history", icon: History, hash: "numbers", match: "hist-numbers" },
    { to: "/dashboard/history", label: "Bills history", icon: ScrollText, hash: "bills", match: "hist-bills" },
    { to: "/dashboard/history", label: "Transactions", icon: Receipt, hash: "deposits", match: "hist-tx" },
    { to: "/dashboard/profile", label: "Profile", icon: UserRound },
  ];
  const adminNav: Item[] = [
    { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/admin/import", label: "Import services", icon: Download },
    { to: "/admin/catalog", label: "Catalogue", icon: Package },
    { to: "/admin/orders", label: "Orders", icon: ScrollText },
    { to: "/admin/customers", label: "Customers", icon: Users },
    { to: "/admin/content", label: "Content & settings", icon: Settings },
    { to: "/admin/brand", label: "Homepage & logo", icon: Store },
    { to: "/admin/hosting", label: "Hosting & payments", icon: Settings },
    { to: "/dashboard", label: "Open shop", icon: Store },
  ];
  const main = admin ? adminNav : userNav;

  const signOut = () => {
    logout();
    nav({ to: "/" });
  };

  const ItemLink = ({ item }: { item: Item }) => {
    const country = String(search.country || "");
    const kind = String(search.kind || "");
    const onNumbers = path.startsWith("/dashboard/numbers");
    let active = false;
    if (item.match === "dash") active = path === "/dashboard";
    else if (item.match === "usa") active = onNumbers && country === "United States" && kind !== "rent";
    else if (item.match === "rent") active = onNumbers && kind === "rent" && country !== "United States";
    else if (item.match === "rent-usa") active = onNumbers && kind === "rent" && country === "United States";
    else if (item.match === "all") active = onNumbers && kind !== "rent" && country !== "United States";
    else if (item.match === "smm") active = path.startsWith("/dashboard/extra") && hash === "smm";
    else if (item.match === "random") active = path.startsWith("/dashboard/extra") && hash !== "smm";
    else if (item.match === "hist-numbers") active = path.startsWith("/dashboard/history") && (hash === "" || hash === "numbers");
    else if (item.match === "hist-bills") active = path.startsWith("/dashboard/history") && hash === "bills";
    else if (item.match === "hist-tx") active = path.startsWith("/dashboard/history") && hash === "deposits";
    else if (item.end) active = path === item.to;
    else active = path === item.to || path.startsWith(item.to + "/");
    return (
      <Link
        to={item.to}
        search={item.search}
        hash={item.hash}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold ${active ? "nav-active text-white" : "text-ink hover:bg-[#E5F2F8]"}`}
      >
        <item.icon className={`size-4 shrink-0 ${active ? "text-white" : "text-[#5b4cdb]"}`} />
        <span className="min-w-0 whitespace-normal leading-snug">{item.label}</span>
      </Link>
    );
  };

  return (
    <div className="shell-screen flex overflow-hidden bg-paper text-ink">
      {open ? <button className="fixed inset-0 z-30 bg-deep/40 lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <aside className={`shell-aside fixed inset-y-0 left-0 z-40 flex w-80 flex-col border-r border-line bg-card transition-transform lg:static lg:translate-x-0 ${open ? "is-open translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-4">
          <Link to={admin ? "/admin" : "/dashboard"} onClick={() => setOpen(false)}>
            <Logo />
          </Link>
          <button className="rounded-lg p-1 lg:hidden" onClick={() => setOpen(false)} aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="px-4 pb-3">
          <p className="truncate text-xs text-muted">{user.email}</p>
          <p className="text-sm font-semibold">{naira(user.balance)}</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          <p className="px-3 pb-1 pt-2 text-xs font-semibold tracking-wide text-muted">{admin ? "ADMIN" : "MENU"}</p>
          {main.map((item) => (
            <ItemLink key={item.label} item={item} />
          ))}
          {!admin ? (
            <div className="pt-2">
              <p className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted">ACCOUNT</p>
              {historyNav.map((item) => (
                <ItemLink key={item.label} item={item} />
              ))}
            </div>
          ) : null}
        </nav>
        <div className="mt-auto space-y-3 border-t border-line p-4">
          <div className="rounded-xl bg-paper p-3">
            <p className="text-sm font-semibold">Need help?</p>
            <p className="text-xs text-muted">24/7 support</p>
            <Link to="/dashboard/support" onClick={() => setOpen(false)} className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-deep py-2 text-sm font-semibold text-on-deep">
              <LifeBuoy className="size-4" /> Contact
            </Link>
          </div>
          <button onClick={signOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-danger hover:bg-paper">
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shell-mobilebar flex min-w-0 items-center gap-2 border-b border-line bg-card px-3 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} className="shrink-0 rounded-xl border border-line p-2" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <Link to={admin ? "/admin" : "/dashboard"} className="mr-auto min-w-0">
            <Logo compact />
          </Link>
          <NoticeBell />
          <Link to="/dashboard/profile" className="grid size-9 shrink-0 place-items-center rounded-full border border-line" aria-label="Profile">
            <UserRound className="size-4" />
          </Link>
          <span className="max-w-[7.5rem] truncate rounded-full bg-paper px-3 py-1 text-sm font-extrabold">{naira(user.balance)}</span>
        </div>
        <div className="app-pad flex-1 overflow-y-auto">
          <AnnounceBar />
          <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6">{children}</div>
        </div>
        <nav className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card px-2 py-2">
          {(admin
            ? [
                { to: "/admin", label: "Home", icon: LayoutDashboard },
                { to: "/admin/import", label: "Import", icon: Download },
                { to: "/admin/catalog", label: "Catalogue", icon: Package },
                { to: "/admin/hosting", label: "Host", icon: Settings },
              ]
            : [
                { to: "/dashboard", label: "Home", icon: LayoutDashboard },
                { to: "/dashboard/history", label: "Orders", icon: History },
                { to: "/dashboard/support", label: "Support", icon: LifeBuoy },
                { to: "/dashboard/profile", label: "Settings", icon: Settings },
              ]
          ).map((item) => (
            <Link key={item.label} to={item.to} className="flex flex-1 flex-col items-center gap-1 py-1 text-xs font-semibold text-ink">
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
          <button type="button" className="flex flex-1 flex-col items-center gap-1 py-1 text-xs font-semibold" onClick={() => setOpen(true)}>
            <Menu className="size-4" />
            Menu
          </button>
        </nav>
      </div>
    </div>
  );
}
