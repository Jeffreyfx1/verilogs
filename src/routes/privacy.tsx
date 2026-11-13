import { createFileRoute } from "@tanstack/react-router";
import { PublicFrame } from "@/components/chrome";

export const Route = createFileRoute("/privacy")({ component: Privacy });

function Privacy() {
  return (
    <PublicFrame>
      <article className="mx-auto max-w-2xl space-y-3 px-4 py-12 text-sm leading-relaxed">
        <h1 className="text-3xl font-extrabold">Privacy</h1>
        <p>We store the name, email and phone you give us, plus wallet movements and orders, so the dashboard can show your numbers and receipts.</p>
        <p>Google sign-in on this preview links the address you choose on this device. It does not send a password to Google.</p>
        <p>Support tickets include whatever you type. Don’t put card numbers in a ticket.</p>
      </article>
    </PublicFrame>
  );
}
