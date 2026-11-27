import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Logo } from "@/components/ui";
import { NoticeBell } from "@/components/bell";
import { AnnounceBar } from "@/components/announce-bar";
import { Glyph, glyph, type GlyphIcon } from "@/components/icons";
import { isMajorService, ServiceLink, ServiceNavProvider } from "@/components/service-nav";
import { useImportRun } from "@/lib/import-run";
import { naira } from "@/lib/money";
import { useStore, useUser } from "@/lib/store";

type Item = {
  to: string;
  label: string;
  icon: GlyphIcon;
  end?: boolean;
  search?: { server: string; country: string; kind: string; service: string };
  hash?: string;
  match?: string;
};

function exactHome(to: string) {
  return to === "/dashboard" || to === "/admin";
}

export function AppShell({ admin, children }: { admin?: boolean; children: ReactNode }) {
  const user = useUser();
  const logout = useStore((s) => s.logout);
  const tick = useStore((s) => s.tickWaiting);
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => String(s.location.hash || "").replace(/^#/, "") });
  const search = useRouterState({ select: (s) => s.location.search as { country?: string; kind?: string } });
  const job = useImportRun();
  const [open, setOpen] = useState(false);
  const userId = user?.id || "";
  useEffect(() => {
    if (!userId) return;
    tick();
    const timer = window.setInterval(() => tick(), 20000);
    return () => window.clearInterval(timer);
  }, [tick, userId]);
  if (!user) return null;

  const userNav: Item[] = [
    { to: "/dashboard", label: "Dashboard", icon: glyph.dashboard, end: true, match: "dash" },
    { to: "/dashboard/wallet", label: "Fund wallet", icon: glyph.wallet },
    { to: "/dashboard/numbers", label: "Buy Number", icon: glyph.hash, search: { server: "", country: "", kind: "", service: "" }, match: "all" },
    { to: "/dashboard/numbers", label: "USA", icon: glyph.flag, search: { server: "", country: "", kind: "usa", service: "" }, match: "usa" },
    { to: "/dashboard/rent", label: "Rent numbers", icon: glyph.crown, match: "rent" },
    { to: "/dashboard/data", label: "Data", icon: glyph.data },
    { to: "/dashboard/airtime", label: "Airtime", icon: glyph.phone },
    { to: "/dashboard/extra", label: "SMM", icon: glyph.megaphone, hash: "smm", match: "smm" },
    { to: "/dashboard/extra", label: "Logs / VPN", icon: glyph.grid, hash: "random", match: "random" },
    { to: "/dashboard/telegram", label: "Telegram Premium", icon: glyph.send, match: "telegram" },
    { to: "/dashboard/announcements", label: "Announcements", icon: glyph.megaphone },
    { to: "/dashboard/refer", label: "Refer & earn", icon: glyph.users },
  ];
  const historyNav: Item[] = [
    { to: "/dashboard/history", label: "Orders", icon: glyph.history, match: "hist" },
    { to: "/dashboard/profile", label: "Profile", icon: glyph.user },
  ];
  const adminNav: Item[] = [
    { to: "/admin", label: "Overview", icon: glyph.dashboard, end: true },
    { to: "/admin/import", label: "Import services", icon: glyph.download },
    { to: "/admin/mapping", label: "Provider mapping", icon: glyph.settings },
    { to: "/admin/catalog", label: "Catalogue", icon: glyph.package },
    { to: "/admin/logos", label: "Category logos", icon: glyph.store },
    { to: "/admin/airtime", label: "Airtime networks", icon: glyph.phone },
    { to: "/admin/orders", label: "Orders", icon: glyph.scroll },
    { to: "/admin/customers", label: "Customers", icon: glyph.users },
    { to: "/admin/deposits", label: "Wallet deposits", icon: glyph.wallet },
    { to: "/admin/referrals", label: "Referrals", icon: glyph.users },
    { to: "/admin/content", label: "Content & settings", icon: glyph.settings },
    { to: "/admin/website", label: "Website content", icon: glyph.scroll },
    { to: "/admin/website-images", label: "Website images", icon: glyph.store },
    { to: "/admin/rent", label: "Rent numbers", icon: glyph.crown },
    { to: "/admin/vera", label: "Vera knowledge", icon: glyph.chat },
    { to: "/admin/vera-analytics", label: "Vera analytics", icon: glyph.posts },
    { to: "/admin/webhooks", label: "API webhook health", icon: glyph.settings },
    { to: "/admin/brand", label: "Homepage & logo", icon: glyph.store },
    { to: "/admin/hosting", label: "Hosting & payments", icon: glyph.settings },
    { to: "/dashboard", label: "Open shop", icon: glyph.store },
  ];
  const main = admin ? adminNav : userNav;
  const importing = job.phase === "fetch" || job.phase === "save";

  const signOut = () => {
    logout();
    nav({ to: "/" });
  };

  const ItemLink = ({ item }: { item: Item }) => {
    const kind = String(search.kind || "");
    const onNumbers = path.startsWith("/dashboard/numbers");
    let active = false;
    if (item.match === "dash") active = path === "/dashboard";
    else if (item.match === "usa") active = onNumbers && kind === "usa";
    else if (item.match === "rent") active = path.startsWith("/dashboard/rent");
    else if (item.match === "all") active = onNumbers && kind !== "usa";
    else if (item.match === "smm") active = path.startsWith("/dashboard/extra") && hash === "smm";
    else if (item.match === "random") active = path.startsWith("/dashboard/extra") && hash !== "smm";
    else if (item.match === "telegram") active = path.startsWith("/dashboard/telegram");
    else if (item.match === "hist") active = path.startsWith("/dashboard/history");
    else if (item.end) active = path === item.to;
    else active = path === item.to || path.startsWith(item.to + "/");
    const className = `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold ${active ? "nav-active text-white" : "text-ink hover:bg-[#E5F2F8]"}`;
    const body = (
      <>
        <Glyph icon={item.icon} className={`nav-glyph shrink-0 ${active ? "text-white" : "text-[#5b4cdb]"}`} />
        <span className="min-w-0 flex-1 whitespace-normal leading-snug">{item.label}</span>
        {item.label === "Airtime" || item.label === "SMM" || item.label === "Telegram Premium" ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold ${active ? "bg-white text-[#174C70]" : "bg-amber-500 text-white"}`}>Soon</span> : null}
      </>
    );
    if (isMajorService(item.to, item.label)) {
      return (
        <ServiceLink to={item.to} search={item.search} hash={item.hash} onBefore={() => setOpen(false)} className={className}>
          {body}
        </ServiceLink>
      );
    }
    return (
      <Link to={item.to} search={item.search} hash={item.hash} onClick={() => setOpen(false)} className={className}>
        {body}
      </Link>
    );
  };

  return (
    <ServiceNavProvider>
    <div className="shell-screen flex overflow-hidden bg-paper text-ink">
      {open ? <button className="fixed inset-0 z-30 bg-deep/40 lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)} /> : null}
      <aside className={`shell-aside fixed inset-y-0 left-0 z-40 flex w-80 flex-col border-r border-line bg-card transition-transform lg:static lg:translate-x-0 ${open ? "is-open translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between px-4 py-4">
          <Link to={admin ? "/admin" : "/dashboard"} onClick={() => setOpen(false)}>
            <Logo />
          </Link>
          <button className="rounded-lg p-1 text-[#5b4cdb] lg:hidden" onClick={() => setOpen(false)} aria-label="Close">
            <Glyph icon={glyph.close} className="size-5" />
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
              <Glyph icon={glyph.support} className="size-4 text-white" /> Contact
            </Link>
          </div>
          <button onClick={signOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-danger hover:bg-paper">
            <Glyph icon={glyph.logout} className="size-4" /> Log out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shell-mobilebar flex min-w-0 items-center gap-2 border-b border-line bg-card px-3 py-3 lg:hidden">
          <button onClick={() => setOpen(true)} className="shrink-0 rounded-xl border border-line p-2 text-[#5b4cdb]" aria-label="Open menu">
            <Glyph icon={glyph.menu} className="size-5" />
          </button>
          <Link to={admin ? "/admin" : "/dashboard"} className="mr-auto min-w-0">
            <Logo compact />
          </Link>
          <NoticeBell />
          <Link to="/dashboard/profile" className="grid size-9 shrink-0 place-items-center rounded-full border border-line text-[#5b4cdb]" aria-label="Profile">
            <Glyph icon={glyph.user} className="size-4" />
          </Link>
          <span className="max-w-[7.5rem] truncate rounded-full bg-paper px-3 py-1 text-sm font-extrabold">{naira(user.balance)}</span>
        </div>
        <div className="app-pad flex-1 overflow-y-auto">
          {importing ? (
            <Link to="/admin/import" className="mb-3 flex items-center justify-between gap-3 rounded-2xl bg-[#174C70] px-4 py-3 text-sm font-bold text-white">
              <span>Import still running</span>
              <span>{job.total ? `${job.saved.toLocaleString("en-NG")} / ${job.total.toLocaleString("en-NG")}` : "Downloading"}</span>
            </Link>
          ) : null}
          <AnnounceBar />
          <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-4 sm:py-6">{children}</div>
        </div>
        <nav className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card px-2 py-2">
          {(admin
            ? [
                { to: "/admin", label: "Home", icon: glyph.dashboard },
                { to: "/admin/import", label: "Import", icon: glyph.download },
                { to: "/admin/catalog", label: "Catalogue", icon: glyph.package },
                { to: "/admin/hosting", label: "Host", icon: glyph.settings },
              ]
            : [
                { to: "/dashboard", label: "Home", icon: glyph.dashboard },
                { to: "/dashboard/history", label: "Orders", icon: glyph.history },
                { to: "/dashboard/support", label: "Support", icon: glyph.support },
                { to: "/dashboard/profile", label: "Settings", icon: glyph.settings },
              ]
          ).map((item) => {
            const on = exactHome(item.to) ? path === item.to : path === item.to || path.startsWith(item.to + "/");
            return (
              <Link key={item.label} to={item.to} className={`flex flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 text-[11px] font-bold ${on ? "nav-active text-white" : "text-ink"}`}>
                <Glyph icon={item.icon} className={`size-5 ${on ? "text-white" : "text-[#5b4cdb]"}`} />
                {item.label}
              </Link>
            );
          })}
          <button type="button" className="flex flex-1 flex-col items-center gap-1 py-1 text-[11px] font-bold text-[#5b4cdb]" onClick={() => setOpen(true)}>
            <Glyph icon={glyph.menu} className="size-5" />
            Menu
          </button>
        </nav>
      </div>
    </div>
    </ServiceNavProvider>
  );
}