import { createFileRoute } from "@tanstack/react-router";

function savedRedirect(request: Request, fallback: string) {
  const raw = request.headers.get("cookie") || "";
  const hit = raw.split(";").map((part) => part.trim()).find((part) => part.startsWith("vl_gredir="));
  if (!hit) return fallback;
  try {
    const value = decodeURIComponent(hit.slice("vl_gredir=".length));
    if (value.startsWith("https://") && value.endsWith("/api/google/callback")) return value;
  } catch {
    /* ignore */
  }
  return fallback;
}

export const Route = createFileRoute("/api/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { googleExchange, googleRedirect, publicOrigin } = await import("@/lib/shop-core.server");
        const url = new URL(request.url);
        const origin = publicOrigin(request);
        const base = origin.replace(/\/$/, "");
        const redirect = savedRedirect(request, googleRedirect(origin));
        const fail = (reason: string) => {
          const headers = new Headers({ Location: `${base}/login?google=failed&reason=${encodeURIComponent(reason.slice(0, 180))}` });
          headers.append("Set-Cookie", "vl_gredir=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
          return new Response(null, { status: 302, headers });
        };
        const code = url.searchParams.get("code") || "";
        if (!code) return fail(url.searchParams.get("error_description") || url.searchParams.get("error") || "Google did not return a sign-in code.");
        const linked = await googleExchange(code, redirect);
        if (linked.error || !linked.token) return fail(linked.error || "Google did not finish sign-in.");
        const next = linked.needsPhone ? "/complete" : linked.role === "admin" ? "/admin" : "/dashboard";
        const headers = new Headers({ Location: base + next });
        const secure = base.startsWith("https://");
        headers.append("Set-Cookie", `vl_session=${linked.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure ? "; Secure" : ""}`);
        headers.append("Set-Cookie", "vl_gredir=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
        return new Response(null, { status: 302, headers });
      },
    },
  },
});