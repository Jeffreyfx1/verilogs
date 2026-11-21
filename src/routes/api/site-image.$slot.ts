import { createFileRoute } from "@tanstack/react-router";
import { fallbackPhoto, siteSlot, siteVariant } from "@/lib/site-images";

export const Route = createFileRoute("/api/site-image/$slot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slot = siteSlot(decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || ""));
        if (!slot) return new Response("Not found", { status: 404 });
        const variant = siteVariant(url.searchParams.get("variant") || "");
        const { readSiteImage } = await import("@/lib/site-images.server");
        const row = await readSiteImage(slot, variant).catch(() => null);
        if (!row?.bytes) {
          return new Response(null, {
            status: 302,
            headers: { Location: fallbackPhoto(slot), "Cache-Control": "public, max-age=60" },
          });
        }
        const bytes = Buffer.from(String(row.bytes), "base64");
        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": row.mime || "image/webp",
            "Cache-Control": "public, max-age=60",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
