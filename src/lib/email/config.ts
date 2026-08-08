import type { SmtpConfig } from "./types";

export type SmtpConfigResult =
  | { configured: true; config: SmtpConfig }
  | { configured: false; reason: string };

/** Google Workspace over STARTTLS — the only transport this project uses. */
const DEFAULT_HOST = "smtp.gmail.com";
const DEFAULT_PORT = 587;

type Env = Record<string, string | undefined>;

function read(env: Env, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parsePort(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const port = Number(raw);
  return port >= 1 && port <= 65535 ? port : null;
}

/**
 * Reads SMTP settings from the environment. Absent credentials are a supported
 * state, not an error — the caller falls back to logging.
 */
export function readSmtpConfig(env: Env = process.env): SmtpConfigResult {
  const user = read(env, "SMTP_USER");
  const password = read(env, "SMTP_PASSWORD");

  const missing = [
    user ? null : "SMTP_USER",
    password ? null : "SMTP_PASSWORD",
  ].filter((name) => name !== null);

  if (!user || !password) {
    return {
      configured: false,
      reason: `${missing.join(" and ")} not set`,
    };
  }

  const rawPort = read(env, "SMTP_PORT");
  const port = rawPort === undefined ? DEFAULT_PORT : parsePort(rawPort);
  if (port === null) {
    return {
      configured: false,
      reason: `SMTP_PORT is not a valid port number: ${rawPort}`,
    };
  }

  return {
    configured: true,
    config: {
      host: read(env, "SMTP_HOST") ?? DEFAULT_HOST,
      port,
      user,
      password,
      from: read(env, "EMAIL_FROM") ?? user,
    },
  };
}
