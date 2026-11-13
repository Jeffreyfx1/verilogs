import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass, Logo } from "@/components/ui";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/complete")({ component: CompletePage });

function CompletePage() {
  const draft = useStore((s) => s.googleDraft);
  const complete = useStore((s) => s.completeGoogle);
  const nav = useNavigate();
  const [name, setName] = useState(draft?.name || "");
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState(false);

  useEffect(() => {
    if (!draft) nav({ to: "/login", replace: true });
  }, [draft, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms) return toast.error("Agree to the terms to finish.");
    if (phone.trim().length < 8) return toast.error("Enter the phone number on the account.");
    const err = await complete({ name, phone });
    if (err) toast.error(err);
    else nav({ to: "/dashboard" });
  };

  if (!draft) return null;
  return (
    <div className="mesh flex min-h-screen flex-col">
      <header className="px-4 py-5"><Link to="/"><Logo /></Link></header>
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <form onSubmit={submit} className="w-full max-w-md space-y-3 rounded-card border border-line bg-card p-6 shadow-card">
          <h1 className="text-2xl font-extrabold">Complete your signup</h1>
          <p className="text-sm text-muted">Google verified {draft.email}. Add your phone so the account can buy numbers and recharges.</p>
          <Field label="Full name"><input className={inputClass} required value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Phone number" hint="Example: +2348012345678"><input className={inputClass} required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234…" /></Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1" />
            <span>I agree to the <Link to="/terms" className="font-semibold text-primary">terms</Link> and want to create my account.</span>
          </label>
          <Button type="submit" className="w-full">Create account</Button>
          <Link to="/login" className="block text-center text-sm text-primary">Back to login</Link>
        </form>
      </div>
    </div>
  );
}
