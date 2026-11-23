export function mapFiveSimStatus(status: string): "waiting" | "received" | "completed" | "refunded" | "unknown" {
  const value = status.trim().toUpperCase();
  if (value === "FINISHED") return "completed";
  if (value === "RECEIVED") return "received";
  if (value === "CANCELED" || value === "CANCELLED" || value === "TIMEOUT" || value === "BANNED") return "refunded";
  if (value === "PENDING" || !value) return "waiting";
  return "unknown";
}

/** PENDING can be cancelled. A received or finished order must not be refunded. */
export function fiveSimCancelDecision(status: string): "cancel" | "already_done" | "already_canceled" | "unknown" {
  const next = mapFiveSimStatus(status);
  if (next === "completed" || next === "received") return "already_done";
  if (next === "refunded") return "already_canceled";
  if (next === "waiting") return "cancel";
  return "unknown";
}
