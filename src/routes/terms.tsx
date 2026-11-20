import { createFileRoute } from "@tanstack/react-router";
import { PublicFrame } from "@/components/chrome";

export const Route = createFileRoute("/terms")({ component: Terms });

function Terms() {
  return (
    <PublicFrame>
      <article className="mx-auto max-w-2xl space-y-3 px-4 py-12 text-sm leading-relaxed">
        <h1 className="text-3xl font-extrabold">Terms</h1>
        <p>VeriLogs sells digital services from a naira wallet: virtual numbers for SMS, data and other digital products.</p>
        <p>A waiting number that never receives a code can be cancelled. The amount returns to the wallet. Completed recharges are not refundable once the provider accepts them.</p>
        <p>Imported catalogues stay off until an admin enables them. Prices include the margin set in admin and, for dollar catalogues, the naira rate.</p>
        <p>Do not use a number to break the law or a platform’s rules. Accounts that do can be closed and the wallet held.</p>
      </article>
    </PublicFrame>
  );
}
