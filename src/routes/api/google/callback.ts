import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { googleExchange } = await import("@/lib/shop-core.server");
        const url = new URL(request.url);
        const origin = process.env.APP_URL || url.origin;
        const code = url.searchParams.get("code") || "";
        if (!code) return Response.redirect(origin.replace(/\/$/, "") + "/login", 302);
        const linked = await googleExchange(code, origin);
        const next = !linked ? "/login" : linked.needsPhone ? "/complete" : linked.role === "admin" ? "/admin" : "/dashboard";
        return Response.redirect(origin.replace(/\/$/, "") + next, 302);
      },
    },
  },
});
