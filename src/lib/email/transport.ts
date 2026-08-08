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

export function createSmtpTransport(
  config: SmtpConfig,
  mailer: Mailer = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    // Port 465 is implicit TLS; everything else (587) upgrades via STARTTLS,
    // which `requireTLS` makes mandatory rather than opportunistic.
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.password },
  }),
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

/**
 * Picks a transport from the environment: SMTP when credentials are present,
 * logging otherwise.
 */
export function createTransport(
  options: { env?: Record<string, string | undefined>; log?: Log } = {},
): EmailTransport {
  const log = options.log ?? console.info;
  const result = readSmtpConfig(options.env ?? process.env);

  if (!result.configured) {
    log(`[email] SMTP disabled (${result.reason}) — messages will be logged.`);
    return createLoggingTransport(log);
  }

  return createSmtpTransport(result.config);
}
