import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { GooglePicker } from "@/components/google-picker";
import { PromoBanners } from "@/components/promos";
import { Button, Field, inputClass, Logo } from "@/components/ui";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const user = useUser();
  const login = useStore((s) => s.login);
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [help, setHelp] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("verilogs.email");
      if (saved) setEmail(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("google") === "failed") {
      toast.error("Google did not finish sign-in. The redirect must be https://veri-logs.com/api/google/callback.");
    }
  }, []);

  const draft = useStore((s) => s.googleDraft);
  const ready = useStore((s) => s.ready);

  useEffect(() => {
    if (!ready) return;
    if (draft) nav({ to: "/complete", replace: true });
    else if (user) nav({ to: user.role === "admin" ? "/admin" : "/dashboard", replace: true });
  }, [ready, draft, user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const err = await login(email, password, remember);
      if (err) toast.error(err);
      else {
        try {
          if (remember) localStorage.setItem("verilogs.email", email);
          else localStorage.removeItem("verilogs.email");
        } catch {
          /* ignore */
        }
      }
    } catch {
      toast.error("Could not reach the shop. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mesh flex min-h-screen flex-col">
      <header className="px-4 py-5">
        <Link to="/"><Logo /></Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <PromoBanners className="mb-4" />
          <div className="rounded-card border border-line bg-card p-6 shadow-card">
          <h1 className="text-2xl font-extrabold">Log in</h1>
          <p className="mt-1 text-sm text-muted">Use your email or a Google account.</p>
          <form onSubmit={submit} className="mt-5 space-y-3">
            <Field label="Email">
              <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
            </Field>
            <Field label="Password">
              <span className="relative block">
                <input className={inputClass} type={show ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
                <button type="button" className="absolute right-3 top-2.5 text-muted" onClick={() => setShow((v) => !v)} aria-label="Show password">
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me on this device
            </label>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Checking…" : "Log in"}</Button>
          </form>
          <div className="my-4 text-center text-xs text-muted">or</div>
          <GooglePicker />
          <p className="mt-4 text-center text-sm">
            New here? <Link to="/register" className="font-semibold text-primary">Create an account</Link>
          </p>
          <p className="mt-2 text-center text-sm">
            <Link to="/forgot" className="text-muted hover:text-ink">Forgot password?</Link>
          </p>
          <button type="button" className="mt-4 text-sm font-semibold text-primary" onClick={() => setHelp((v) => !v)}>
            Having trouble signing in?
          </button>
          {help ? (
            <div className="mt-3 space-y-3 rounded-xl border border-line bg-paper p-3 text-sm">
              <p>If you used Google, continue with Google. You will confirm your name and phone the first time. Password reset will not work until you set a VeriLogs password on your profile.</p>
              <Link to="/community" className="inline-block font-semibold text-primary">Join the community</Link>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
