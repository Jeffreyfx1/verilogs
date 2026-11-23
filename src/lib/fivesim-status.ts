export function mapFiveSimStatus(status: string, hasSms = false): "waiting" | "received" | "completed" | "refunded" | "unknown" {
  const value = status.trim().toUpperCase();
  if (value === "FINISHED") return "completed";
  if (value === "CANCELED" || value === "CANCELLED" || value === "TIMEOUT" || value === "BANNED") return "refunded";
  if (value === "RECEIVED") return hasSms ? "received" : "waiting";
  if (value === "PENDING" || !value) return "waiting";
  return "unknown";
}

/** Cancel is allowed only while FiveSim has not delivered an SMS. */
export function fiveSimCancelDecision(status: string, hasSms = false): "cancel" | "already_done" | "already_canceled" | "unknown" {
  const next = mapFiveSimStatus(status, hasSms);
  if (next === "completed" || next === "received") return "already_done";
  if (next === "refunded") return "already_canceled";
  if (next === "waiting") return "cancel";
  return "unknown";
}
