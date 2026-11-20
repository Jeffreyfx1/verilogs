/** Connection settings for node-postgres. Never includes the password in returned logs. */

export function databaseHost(connectionString) {
  try {
    const normalized = connectionString.replace(/^postgres(ql)?:/i, "http:");
    return new URL(normalized).hostname || "";
  } catch {
    return "";
  }
}

function sslMode(connectionString) {
  const match = /(?:\?|&)sslmode=([^&]+)/i.exec(connectionString);
  return match ? decodeURIComponent(match[1]).toLowerCase() : "";
}

/** Render's internal hostname label ends in `-a`. External hosts do not. */
export function isRenderInternalHost(host) {
  const label = String(host || "").split(".")[0];
  return /-a$/i.test(label);
}

export function isLocalHost(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".internal");
}

/**
 * External Render Postgres rejects a plaintext startup and then the socket
 * dies with "Connection terminated unexpectedly". Internal and local hosts
 * stay plaintext. An explicit sslmode in the URL is left for `pg` to parse.
 */
export function sslConfig(connectionString) {
  const mode = sslMode(connectionString);
  if (mode === "disable") return false;
  if (mode) return undefined;
  const host = databaseHost(connectionString);
  if (!host || isLocalHost(host) || isRenderInternalHost(host)) return false;
  return { rejectUnauthorized: false };
}

export function poolConfig(connectionString, { max = 1, applicationName = "verilogs" } = {}) {
  const config = {
    connectionString,
    max,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 10_000,
    keepAlive: true,
    application_name: applicationName,
  };
  const ssl = sslConfig(connectionString);
  if (ssl !== undefined) config.ssl = ssl;
  return config;
}

export function describeTarget(connectionString) {
  const host = databaseHost(connectionString) || "unknown-host";
  const ssl = sslConfig(connectionString);
  const mode = ssl === undefined ? "url" : ssl ? "require" : "off";
  return `${host} ssl=${mode}`;
}

const TRANSIENT = /terminated|ECONNRESET|EPIPE|ETIMEDOUT|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|timeout expired|Connection ended|too many clients|sorry, too many clients|57P01|08000|08001|08003|08006|53300/i;

export function isTransientConnectionError(err) {
  const message = err instanceof Error ? err.message : String(err || "");
  const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
  return TRANSIENT.test(message) || TRANSIENT.test(code);
}
