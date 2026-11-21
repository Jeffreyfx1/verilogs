import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/getatext/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { acceptGetatextWebhook } = await import("@/lib/fulfilment.server");
        const url = new URL(request.url);
        const token = url.searchParams.get("token") || request.headers.get("x-verilogs-token") || "";
        let body: unknown = null;
        try {
          body = await request.json();
        } catch {
          body = null;
        }
        const result = await acceptGetatextWebhook(token, body);
        return new Response(result.error || "ok", { status: result.http });
      },
    },
  },
});
