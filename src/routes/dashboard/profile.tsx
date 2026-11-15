import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import { useStore, useUser } from "@/lib/store";

export const Route = createFileRoute("/dashboard/profile")({ component: ProfilePage });

function ProfilePage() {
  const user = useUser();
  const update = useStore((s) => s.updateProfile);
  const change = useStore((s) => s.changePassword);
  const [name, setName] = useState(user?.name || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [oldPw, setOldPw] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  if (!user) return null;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="balance-card rounded-card px-5 py-4">
        <h1 className="text-2xl font-extrabold">Profile settings</h1>
        <p className="text-sm text-on-deep/80">Name, phone and password for this account.</p>
      </section>
      {user.google ? (
        <section className="rounded-card border border-line bg-card p-4 text-sm shadow-card">
          <p className="font-semibold">Google sign-in linked</p>
          <p className="text-muted">{user.email}. You can still set a password below and log in either way.</p>
        </section>
      ) : null}
      <section className="grid gap-4 rounded-card border border-line bg-card p-5 shadow-card md:grid-cols-2">
        <div className="grid place-items-center">
          <div className="grid size-24 place-items-center rounded-card bg-primary text-3xl font-extrabold text-on-primary">{(user.name || "V").slice(0, 1).toUpperCase()}</div>
          <p className="mt-2 text-center text-sm font-semibold">{user.name}</p>
        </div>
        <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); const err = await update({ name, phone }); if (err) toast.error(err); else toast.success("Profile saved"); }}>
          <h2 className="font-bold">User information</h2>
          <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email"><input className={inputClass} value={user.email} disabled /></Field>
          <Field label="Phone number" hint="Include the country code. Don't add 0 after +234."><input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Button type="submit" className="w-full">Save changes</Button>
        </form>
      </section>
      <form className="space-y-3 rounded-card border border-line bg-card p-5 shadow-card" onSubmit={async (e) => {
        e.preventDefault();
        if (next !== confirm) return toast.error("New passwords do not match.");
        const err = await change(oldPw, next);
        if (err) toast.error(err);
        else { toast.success("Password updated"); setOldPw(""); setNext(""); setConfirm(""); }
      }}>
        <h2 className="font-bold">Change password</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Old password"><input className={inputClass} type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} /></Field>
          <Field label="New password"><input className={inputClass} type="password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <Field label="Confirm"><input className={inputClass} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        </div>
        <Button type="submit" className="w-full">Save password</Button>
      </form>
    </div>
  );
}
