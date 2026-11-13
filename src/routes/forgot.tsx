import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass, Logo } from "@/components/ui";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/forgot")({ component: ForgotPage });

function ForgotPage() {
  const reset = useStore((s) => s.resetPassword);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = await reset(email, password);
    if (err) toast.error(err);
    else setDone(true);
  };

  return (
    <div className="mesh flex min-h-screen flex-col">
      <header className="px-4 py-5"><Link to="/"><Logo /></Link></header>
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-card border border-line bg-card p-6 shadow-card">
          <h1 className="text-2xl font-extrabold">Reset password</h1>
          <p className="text-sm text-muted">Google-only accounts need a password here before email login will work.</p>
          {done ? <p className="text-sm text-ok">Password updated. You can log in.</p> : null}
          <Field label="Email"><input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="New password"><input className={inputClass} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Button type="submit" className="w-full">Update password</Button>
          <Link to="/login" className="block text-center text-sm text-primary">Back to login</Link>
        </form>
      </div>
    </div>
  );
}
