import { createFileRoute } from "@tanstack/react-router";

const DIAG = "vl-7c2e91";

function redact(text: string) {
  return text
    .replace(/AIza[0-9A-Za-z_-]{8,}/g, "[key]")
    .replace(/\bAQ\.[A-Za-z0-9_-]{8,}/g, "[key]")
    .replace(/key=[^&\s]+/gi, "key=[key]")
    .slice(0, 900);
}

function keyFormat(key: string) {
  if (key.startsWith("AIza")) return "AIza";
  if (key.startsWith("AQ.")) return "AQ.";
  return "other";
}

type Probe = {
  httpStatus: number;
  googleStatus: string;
  googleReason: string;
  googleMessage: string;
  reply: string;
  finishReason: string;
  blockReason: string;
  partKeys: string[];
  authSucceeded: boolean;
  ok: boolean;
};

async function probe(key: string, model: string, body: Record<string, unknown>): Promise<Probe> {
  const failed = (googleMessage: string): Probe => ({
    httpStatus: 0,
    googleStatus: "",
    googleReason: "",
    googleMessage,
    reply: "",
    finishReason: "",
    blockReason: "",
    partKeys: [],
    authSucceeded: false,
    ok: false,
  });
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    const raw = await res.text();
    let message = "";
    let status = "";
    let reason = "";
    let reply = "";
    let finishReason = "";
    let blockReason = "";
    let partKeys: string[] = [];
    try {
      const parsed = JSON.parse(raw) as {
        error?: { message?: string; status?: string; details?: { reason?: string }[] };
        candidates?: { finishReason?: string; content?: { parts?: Record<string, unknown>[] } }[];
        promptFeedback?: { blockReason?: string };
      };
      message = parsed.error?.message || "";
      status = parsed.error?.status || "";
      reason = parsed.error?.details?.map((item) => item.reason).filter(Boolean).join(",") || "";
      const candidate = parsed.candidates?.[0];
      finishReason = candidate?.finishReason || "";
      blockReason = parsed.promptFeedback?.blockReason || "";
      const parts = candidate?.content?.parts || [];
      partKeys = parts.map((part) => Object.keys(part).sort().join("+"));
      reply = parts.map((part) => (typeof part.text === "string" ? part.text : "")).join("");
    } catch {
      message = raw.slice(0, 400);
    }
    const blob = `${status} ${message} ${reason}`;
    return {
      httpStatus: res.status,
      googleStatus: status,
      googleReason: reason,
      googleMessage: redact(message),
      reply: reply.slice(0, 80),
      finishReason,
      blockReason,
      partKeys: partKeys.slice(0, 6),
      authSucceeded: res.status !== 401 && res.status !== 403 && !/API key not valid|API_KEY_INVALID|PERMISSION_DENIED|ACCESS_TOKEN_TYPE_UNSUPPORTED/i.test(blob),
      ok: res.ok && reply.trim().length > 0,
    };
  } catch (err) {
    return failed(err instanceof Error ? redact(`${err.name}: ${err.message}`) : "The Gemini request failed before a response.");
  }
}

/** Temporary production probe. Header-gated. No customer data and no API key in the response. */
export const Route = createFileRoute("/api/vera/gemini-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (request.headers.get("x-vera-diag") !== DIAG) return new Response("not found", { status: 404 });
        const key = process.env.GEMINI_API_KEY?.trim() || "";
        const modelEnv = (process.env.GEMINI_MODEL || "").trim();
        const providerEnv = (process.env.VERA_PROVIDER || "").trim();
        const model = modelEnv || "gemini-3.8-flash";
        const report: Record<string, unknown> = {
          keyPresent: key.length > 0,
          keyLength: key.length,
          keyFormat: key ? keyFormat(key) : "absent",
          modelEnv: modelEnv || null,
          requestModel: model,
          providerEnv: providerEnv || null,
          xaiKeyPresent: !!process.env.XAI_API_KEY?.trim(),
          authHeader: "x-goog-api-key",
          bearerUsed: false,
        };
        if (!key) {
          report.official = { httpStatus: 0, authSucceeded: false, ok: false, googleMessage: "GEMINI_API_KEY is empty in this process." };
          return Response.json(report);
        }
        const official = await probe(key, model, {
          contents: [{ parts: [{ text: "Reply with the single word pong." }] }],
        });
        report.official = official;
        if (!official.ok) return Response.json(report);
        report.withTemperature = await probe(key, model, {
          contents: [{ role: "user", parts: [{ text: "Reply with the single word pong." }] }],
          generationConfig: { maxOutputTokens: 480, temperature: 0.3 },
        });
        const withTemperature = report.withTemperature as Probe;
        if (!withTemperature.ok) return Response.json(report);
        report.withTool = await probe(key, model, {
          systemInstruction: { parts: [{ text: "You are Vera. Reply briefly." }] },
          contents: [{ role: "user", parts: [{ text: "Reply with the single word pong." }] }],
          generationConfig: { maxOutputTokens: 480, temperature: 0.3 },
          tools: [{
            functionDeclarations: [{
              name: "search_catalogue",
              description: "Search public catalogue stock.",
              parameters: { type: "object", properties: { query: { type: "string" } } },
            }],
          }],
        });
        return Response.json(report);
      },
    },
  },
});
