import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { NoticeBell } from "@/components/bell";
import { DevicePicker } from "@/components/device-picker";
import { Logo } from "@/components/ui";
import { useStore, useUser } from "@/lib/store";

const LINKS = [
  { href: "/#offer", label: "Services" },
  { href: "/#why", label: "Features" },
  { href: "/#how", label: "How it works" },
];

export function PublicHeader() {
  const user = useUser();
  const brand = useStore((s) => s.settings.brand);
  const [open, setOpen] = useState(false);
  const home = user ? (user.role === "admin" ? "/admin" : "/dashboard") : "/login";
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-4">
        <Link to="/" className="mr-1" onClick={() => setOpen(false)} aria-label={brand}>
          <Logo />
        </Link>
        <nav className="nav-desk items-center gap-6 text-sm font-medium text-muted">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="hover:text-ink">
              {l.label}
            </a>
          ))}
        </nav>
        <span className="flex-1" />
        <DevicePicker compact />
        <NoticeBell />
        <div className="nav-desk items-center gap-2">
          {user ? (
            <Link to={home} className="btn-gradient rounded-xl px-4 py-2 text-sm font-semibold">
              {user.role === "admin" ? "Admin" : "Dashboard"}
            </Link>
          ) : (
            <>
              <Link to="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-ink hover:bg-paper">
                Log in
              </Link>
              <Link to="/register" className="btn-gradient rounded-xl px-4 py-2 text-sm font-semibold">
                Sign up
              </Link>
            </>
          )}
        </div>
        <button className="nav-phone rounded-xl border border-line p-2" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {open ? (
        <div className="nav-phone space-y-1 border-t border-line px-4 py-3">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="block rounded-xl px-3 py-2 text-sm font-medium" onClick={() => setOpen(false)}>
              {l.label}
            </a>
          ))}
          {user ? (
            <Link to={home} className="block rounded-xl px-3 py-2 text-sm font-semibold text-primary" onClick={() => setOpen(false)}>
              {user.role === "admin" ? "Admin" : "Dashboard"}
            </Link>
          ) : (
            <>
              <Link to="/login" className="block rounded-xl px-3 py-2 text-sm" onClick={() => setOpen(false)}>
                Log in
              </Link>
              <Link to="/register" className="block rounded-xl px-3 py-2 text-sm font-semibold text-primary" onClick={() => setOpen(false)}>
                Sign up
              </Link>
            </>
          )}
        </div>
      ) : null}
    </header>
  );
}

export function PublicFooter() {
  const brand = useStore((s) => s.settings.brand);
  return (
    <footer className="mt-auto border-t border-line bg-deep text-on-deep">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-3 text-sm font-medium text-on-deep/80">Virtual numbers, data, airtime and bills. Wallet in naira. Servers stay separate.</p>
        </div>
        <div>
          <p className="text-sm font-semibold">Help</p>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Link to="/faq" className="hover:underline">FAQ</Link>
            <Link to="/support" className="hover:underline">Support</Link>
            <Link to="/community" className="hover:underline">Community</Link>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold">Legal</p>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Link to="/terms" className="hover:underline">Terms</Link>
            <Link to="/privacy" className="hover:underline">Privacy</Link>
          </div>
        </div>
      </div>
      <p className="border-t border-on-deep/15 px-4 py-4 text-center text-xs text-on-deep/70">© {new Date().getFullYear()} {brand || "VeriLogs"}. All rights reserved.</p>
    </footer>
  );
}

export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <PublicHeader />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
