import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, Field, inputClass } from "@/components/ui";
import type { Banner, WelcomePopup } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/admin/brand")({ component: BrandPage });

function BrandPage() {
  const settings = useStore((s) => s.settings);
  const save = useStore((s) => s.saveSettings);
  const [brand, setBrand] = useState(settings.brand);
  const [home, setHome] = useState(settings.home);
  const [banners, setBanners] = useState<Banner[]>(settings.banners);
  const [welcome, setWelcome] = useState(settings.supportWelcome);
  const [popup, setPopup] = useState<WelcomePopup>(settings.popup);
  const [links, setLinks] = useState({ whatsapp: settings.whatsapp, telegram: settings.telegram });

  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 120000) return toast.error("Keep the logo under 120KB.");
    const reader = new FileReader();
    reader.onload = () => {
      const logo = String(reader.result || "");
      void save({ logo }).then((err) => (err ? toast.error(err) : toast.success("Logo updated")));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Homepage and logo</h1>
        <p className="mt-1 text-sm text-muted">This is the page people see before they log in. Banners sit under the hero.</p>
      </div>
      <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
        <h2 className="font-bold">Logo</h2>
        {settings.logo ? <img src={settings.logo} alt="" className="size-16 rounded-xl object-cover" /> : <p className="text-sm text-muted">The built-in mark is showing.</p>}
        <input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => onFile(e.target.files?.[0])} />
        {settings.logo ? <button type="button" className="text-xs font-semibold text-danger" onClick={() => void save({ logo: "" })}>Remove logo</button> : null}
      </section>
      <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
        <Field label="Brand name"><input className={inputClass} value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
        <Field label="Hero eyebrow"><input className={inputClass} value={home.eyebrow} onChange={(e) => setHome({ ...home, eyebrow: e.target.value })} /></Field>
        <Field label="Hero title"><input className={inputClass} value={home.title} onChange={(e) => setHome({ ...home, title: e.target.value })} /></Field>
        <Field label="Hero text"><textarea className={inputClass} rows={4} value={home.body} onChange={(e) => setHome({ ...home, body: e.target.value })} /></Field>
        <Field label="Support bot welcome"><textarea className={inputClass} rows={2} value={welcome} onChange={(e) => setWelcome(e.target.value)} /></Field>
        <Button onClick={() => void save({ brand, home, supportWelcome: welcome }).then((err) => err ? toast.error(err) : toast.success("Homepage saved"))}>Save homepage</Button>
      </section>
      <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
        <h2 className="font-bold">Welcome popup</h2>
        <p className="text-sm text-muted">This opens once per visit on the public site and inside the dashboard. Leave a link empty to hide that button.</p>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={popup.enabled} onChange={(e) => setPopup({ ...popup, enabled: e.target.checked })} />
          Show the popup
        </label>
        <Field label="Title"><input className={inputClass} value={popup.title} onChange={(e) => setPopup({ ...popup, title: e.target.value })} /></Field>
        <Field label="Text"><textarea className={inputClass} rows={2} value={popup.body} onChange={(e) => setPopup({ ...popup, body: e.target.value })} /></Field>
        <Field label="WhatsApp title"><input className={inputClass} value={popup.whatsappTitle} onChange={(e) => setPopup({ ...popup, whatsappTitle: e.target.value })} /></Field>
        <Field label="WhatsApp text"><input className={inputClass} value={popup.whatsappBody} onChange={(e) => setPopup({ ...popup, whatsappBody: e.target.value })} /></Field>
        <Field label="WhatsApp link"><input className={inputClass} value={links.whatsapp} onChange={(e) => setLinks({ ...links, whatsapp: e.target.value })} placeholder="https://chat.whatsapp.com/..." /></Field>
        <Field label="Telegram title"><input className={inputClass} value={popup.telegramTitle} onChange={(e) => setPopup({ ...popup, telegramTitle: e.target.value })} /></Field>
        <Field label="Telegram text"><input className={inputClass} value={popup.telegramBody} onChange={(e) => setPopup({ ...popup, telegramBody: e.target.value })} /></Field>
        <Field label="Telegram link"><input className={inputClass} value={links.telegram} onChange={(e) => setLinks({ ...links, telegram: e.target.value })} placeholder="https://t.me/..." /></Field>
        <Field label="Button label"><input className={inputClass} value={popup.button} onChange={(e) => setPopup({ ...popup, button: e.target.value })} /></Field>
        <Button onClick={() => void save({ popup, whatsapp: links.whatsapp, telegram: links.telegram }).then((err) => err ? toast.error(err) : toast.success("Popup saved"))}>Save popup</Button>
      </section>
      <section className="space-y-3 rounded-card border border-line bg-card p-4 shadow-card">
        <h2 className="font-bold">Banners</h2>
        {banners.map((b, i) => (
          <div key={b.id} className="space-y-2 rounded-xl bg-paper p-3">
            <input className={inputClass} value={b.title} onChange={(e) => setBanners(banners.map((x, n) => n === i ? { ...x, title: e.target.value } : x))} placeholder="Title" />
            <textarea className={inputClass} rows={2} value={b.body} onChange={(e) => setBanners(banners.map((x, n) => n === i ? { ...x, body: e.target.value } : x))} placeholder="Details" />
            <input className={inputClass} value={b.href} onChange={(e) => setBanners(banners.map((x, n) => n === i ? { ...x, href: e.target.value } : x))} placeholder="/register" />
            <button type="button" className="text-xs font-semibold text-danger" onClick={() => setBanners(banners.filter((x) => x.id !== b.id))}>Remove</button>
          </div>
        ))}
        <Button tone="soft" onClick={() => setBanners([...banners, { id: "b" + Date.now(), title: "", body: "", href: "/register" }])}>Add banner</Button>
        <Button onClick={() => void save({ banners }).then((err) => err ? toast.error(err) : toast.success("Banners saved"))}>Save banners</Button>
      </section>
    </div>
  );
}
