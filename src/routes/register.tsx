import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Glyph, glyph } from "@/components/icons";
import { toast } from "sonner";
import { GooglePicker } from "@/components/google-picker";
import { PromoBanners } from "@/components/promos";
import { Button, Field, inputClass, Logo } from "@/components/ui";
import { normalizeReferralCode } from "@/lib/referral";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/register")({
  validateSearch: (search: Record<string, unknown>): { ref?: string } => {
    const parsed = normalizeReferralCode(typeof search.ref === "string" ? search.ref : "");
    return parsed.ok && parsed.code ? { ref: parsed.code } : {};
  },
  component: RegisterPage,
});

function RegisterPage() {
  const { ref = "" } = Route.useSearch();
  const user = useUser();
  const register = useStore((s) => s.register);
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [referral, setReferral] = useState(ref);
  const [terms, setTerms] = useState(false);
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    if (user) nav({ to: "/dashboard", replace: true });
  }, [user, nav]);

  const onReferral = (value: string) => {
    const next = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
    setReferral(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const parsed = normalizeReferralCode(next);
    if (!next) url.searchParams.delete("ref");
    else if (parsed.ok && parsed.code) url.searchParams.set("ref", parsed.code);
    else return;
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms) return toast.error("Agree to the terms to create an account.");
    if (form.password !== form.confirm) return toast.error("Passwords do not match.");
    if (form.phone.trim().length < 8) return toast.error("Enter a real phone number.");
    setBusy(true);
    try {
      const err = await register({ ...form, remember, referral });
      if (err) toast.error(err);
      else nav({ to: "/dashboard" });
    } catch {
      toast.error("Could not reach the shop. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mesh flex min-h-screen flex-col">
      <header className="px-4 py-5"><Link to="/"><Logo /></Link></header>
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <PromoBanners className="mb-4" />
          <form onSubmit={submit} className="space-y-3 rounded-card border border-line bg-card p-6 shadow-card">
          <h1 className="text-2xl font-extrabold">Create new account</h1>
          <Field label="Name"><input className={inputClass} required value={form.name} onChange={set("name")} placeholder="Enter your full name" /></Field>
          <Field label="Email"><input className={inputClass} type="email" required value={form.email} onChange={set("email")} placeholder="Enter your email" /></Field>
          <Field label="Phone number"><input className={inputClass} required value={form.phone} onChange={set("phone")} placeholder="+234…" /></Field>
          <Field label="Password">
            <span className="relative block">
              <input className={inputClass} type={show ? "text" : "password"} required minLength={8} value={form.password} onChange={set("password")} placeholder="At least 8 characters" />
              <button type="button" className="absolute right-3 top-2.5 text-muted" onClick={() => setShow((v) => !v)} aria-label="Show password">{show ? <Glyph icon={glyph.eyeOff} className="size-4" /> : <Glyph icon={glyph.eye} className="size-4" />}</button>
            </span>
          </Field>
          <Field label="Confirm password"><input className={inputClass} type={show ? "text" : "password"} required value={form.confirm} onChange={set("confirm")} placeholder="Repeat password" /></Field>
          <Field label="Referral code (optional)" hint="Filled in automatically from a referral link. Leave blank if you were not invited.">
            <input className={inputClass} value={referral} onChange={(e) => onReferral(e.target.value)} placeholder="Referral code" autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={16} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me on this device
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1" />
            <span>I agree to the <Link to="/terms" className="font-semibold text-primary">terms</Link> and want to create my account.</span>
          </label>
          <Button type="submit" className="w-full" busy={busy}>{busy ? "Creating…" : "Sign up"}</Button>
          <GooglePicker />
          <p className="text-center text-sm">Already have an account? <Link to="/login" className="font-semibold text-primary">Log in</Link></p>
        </form>
        </div>
      </div>
    </div>
  );
}
