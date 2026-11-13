import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/paystack/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { creditFromWebhook } = await import("@/lib/shop-core.server");
        const raw = await request.text();
        const ok = await creditFromWebhook(raw, request.headers.get("x-paystack-signature"));
        return new Response(ok ? "ok" : "rejected", { status: ok ? 200 : 400 });
      },
    },
  },
});
