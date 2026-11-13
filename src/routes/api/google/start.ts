import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/google/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { googleConfigured, googleStartUrl } = await import("@/lib/shop-core.server");
        const origin = process.env.APP_URL || new URL(request.url).origin;
        if (!googleConfigured()) {
          return new Response(
            "Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the host, with redirect " +
              origin.replace(/\/$/, "") +
              "/api/google/callback",
            { status: 501, headers: { "content-type": "text/plain; charset=utf-8" } },
          );
        }
        return Response.redirect(googleStartUrl(origin), 302);
      },
    },
  },
});
