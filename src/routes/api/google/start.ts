import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/google/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { googleConfigured, googleRedirect, googleStartUrl, publicOrigin } = await import("@/lib/shop-core.server");
        const origin = publicOrigin(request);
        const redirect = googleRedirect(origin);
        if (!googleConfigured()) {
          return new Response(
            "Google sign-in is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the host, with redirect " + redirect,
            { status: 501, headers: { "content-type": "text/plain; charset=utf-8" } },
          );
        }
        const secure = origin.startsWith("https://");
        const headers = new Headers({ Location: googleStartUrl(redirect) });
        headers.append("Set-Cookie", `vl_gredir=${encodeURIComponent(redirect)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`);
        return new Response(null, { status: 302, headers });
      },
    },
  },
});