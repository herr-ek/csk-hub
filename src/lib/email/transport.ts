import nodemailer from "nodemailer";
import { readSmtpConfig } from "./config";
import type { EmailMessage, EmailTransport, SmtpConfig } from "./types";

/**
 * The slice of nodemailer this module uses. Narrow enough to substitute in a
 * test without a live SMTP server.
 */
export type Mailer = {
  sendMail(options: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
};

type Log = (line: string) => void;

/**
 * Development fallback: writes what would have been sent, body and links
 * intact, so invite and reset flows can be walked through without a mailbox.
 */
export function createLoggingTransport(
  log: Log = console.info,
): EmailTransport {
  return {
    delivery: "logged",
    async send(message: EmailMessage) {
      log(
        [
          "[email] SMTP not configured — message not sent:",
          `  To:      ${message.to}`,
          `  Subject: ${message.subject}`,
          message.body.replace(/^/gm, "  | "),
        ].join("\n"),
      );
    },
  };
}

/**
 * Used when SMTP is configured but configured wrongly. Every send fails, which
 * `sendEmailWith` reports as a transport error — deliberately not the logging
 * transport, so a deployment typo can never masquerade as a successful send.
 */
export function createMisconfiguredTransport(reason: string): EmailTransport {
  return {
    // Never observed: `send` always throws, so no result carries this value.
    delivery: "smtp",
    async send() {
      throw new Error(`SMTP is misconfigured: ${reason}`);
    },
  };
}

export function createSmtpTransport(
  config: SmtpConfig,
  mailer: Mailer = defaultMailer(config),
): EmailTransport {
  return {
    delivery: "smtp",
    async send(message: EmailMessage) {
      await mailer.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
      });
    },
  };
}

function defaultMailer(config: SmtpConfig): Mailer {
  // Port 465 is implicit TLS; everything else (587) upgrades via STARTTLS,
  // which `requireTLS` makes mandatory rather than opportunistic.
  const implicitTls = config.port === 465;
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: implicitTls,
    requireTLS: !implicitTls,
    auth: { user: config.user, pass: config.password },
  });
}

/**
 * Picks a transport from the environment: SMTP when configured, logging when
 * no credentials are set, and a failing transport when they are set wrongly.
 */
export function createTransport(
  options: {
    env?: Record<string, string | undefined>;
    log?: Log;
    logError?: Log;
  } = {},
): EmailTransport {
  const log = options.log ?? console.info;
  const logError = options.logError ?? console.error;
  const result = readSmtpConfig(options.env ?? process.env);

  switch (result.status) {
    case "configured":
      return createSmtpTransport(result.config);
    case "absent":
      log(
        `[email] SMTP disabled (${result.reason}) — messages will be logged.`,
      );
      return createLoggingTransport(log);
    case "invalid":
      logError(`[email] SMTP is misconfigured: ${result.reason}`);
      return createMisconfiguredTransport(result.reason);
  }
}
