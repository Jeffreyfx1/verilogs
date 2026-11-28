import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/vera/stream")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let question = "";
        let threadId = "";
        try {
          const body = (await request.json()) as { question?: unknown; threadId?: unknown };
          question = String(body?.question || "").slice(0, 500);
          threadId = String(body?.threadId || "").slice(0, 80);
        } catch {
          return new Response("bad request", { status: 400 });
        }
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (event: string, data: unknown) => {
              controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
            };
            try {
              const { askSupportFromCookie } = await import("@/lib/shop-core.server");
              const result = await askSupportFromCookie(request.headers.get("cookie") || "", question, threadId, (chunk) => {
                if (chunk) send("delta", { text: chunk });
              });
              send("done", { threadId: result.threadId, text: result.text, escalated: result.escalated });
            } catch {
              send("error", { text: "I could not answer just now. Use the Telegram channel and a person will pick it up." });
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
