import { createFileRoute } from "@tanstack/react-router";
import { imageCacheControl, siteSlot, siteVariant, staticPhoto } from "@/lib/site-images";

export const Route = createFileRoute("/api/site-image/$slot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const slot = siteSlot(decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || ""));
        if (!slot) return new Response("Not found", { status: 404 });
        const variant = siteVariant(url.searchParams.get("variant") || "");
        const version = url.searchParams.get("v") || "";
        const { readSiteImage } = await import("@/lib/site-images.server");
        const row = await readSiteImage(slot, variant).catch(() => null);
        if (!row?.bytes) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: staticPhoto(slot, variant),
              "Cache-Control": "public, max-age=300",
            },
          });
        }
        const cache = imageCacheControl(version, row.updated_at);
        const etag = `"${row.updated_at}"`;
        if (request.headers.get("if-none-match") === etag) {
          return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": cache } });
        }
        const bytes = Buffer.from(String(row.bytes), "base64");
        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": row.mime || "image/webp",
            "Content-Length": String(bytes.length),
            "Cache-Control": cache,
            ETag: etag,
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});