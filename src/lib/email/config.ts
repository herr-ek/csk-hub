import type { SmtpConfig } from "./types";

/**
 * Three states, not two. `absent` is the ordinary local-development case and
 * falls back to logging; `invalid` is a deployment mistake and must not be
 * mistaken for it, or a typo would silently swallow every message.
 */
export type SmtpConfigResult =
  | { status: "configured"; config: SmtpConfig }
  | { status: "absent"; reason: string }
  | { status: "invalid"; reason: string };

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
 * Reads SMTP settings from the environment. Having no credentials at all is a
 * supported state; having half of them, or a malformed port, is not.
 */
export function readSmtpConfig(env: Env = process.env): SmtpConfigResult {
  const user = read(env, "SMTP_USER");
  const password = read(env, "SMTP_PASSWORD");

  if (!user && !password) {
    return { status: "absent", reason: "SMTP_USER and SMTP_PASSWORD not set" };
  }
  if (!user || !password) {
    const missing = user ? "SMTP_USER" : "SMTP_PASSWORD";
    const present = user ? "SMTP_PASSWORD" : "SMTP_USER";
    return {
      status: "invalid",
      reason: `${present} is set but ${missing} is not`,
    };
  }

  const rawPort = read(env, "SMTP_PORT");
  const port = rawPort === undefined ? DEFAULT_PORT : parsePort(rawPort);
  if (port === null) {
    return {
      status: "invalid",
      reason: `SMTP_PORT is not a valid port number: "${rawPort}"`,
    };
  }

  return {
    status: "configured",
    config: {
      host: read(env, "SMTP_HOST") ?? DEFAULT_HOST,
      port,
      user,
      password,
      from: read(env, "EMAIL_FROM") ?? user,
    },
  };
}
