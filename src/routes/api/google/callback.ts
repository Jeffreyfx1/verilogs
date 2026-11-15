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
        const base = origin.replace(/\/$/, "");
        const next = !linked ? "/login?google=failed" : linked.needsPhone ? "/complete" : linked.role === "admin" ? "/admin" : "/dashboard";
        const headers = new Headers({ Location: base + next });
        if (linked?.token) {
          const secure = base.startsWith("https://");
          headers.append("Set-Cookie", `vl_session=${linked.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure ? "; Secure" : ""}`);
        }
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
