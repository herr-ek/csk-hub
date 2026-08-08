import "server-only";

import { sendEmailsWith, sendEmailWith } from "./send";
import { createTransport } from "./transport";
import type {
  BulkEmailMessage,
  EmailMessage,
  EmailTransport,
  SendEmailResult,
  SendEmailsOptions,
  SendEmailsResult,
} from "./types";

export type {
  BulkEmailMessage,
  EmailDelivery,
  EmailError,
  EmailErrorCode,
  EmailMessage,
  RecipientOutcome,
  SendEmailResult,
  SendEmailsOptions,
  SendEmailsResult,
} from "./types";

/**
 * Built once and reused, so the environment is read and reported on once per
 * process rather than once per message. The transport is not connection-pooled
 * (`pool` is left off deliberately: this deploys to serverless functions, where
 * a held-open SMTP connection outlives its usefulness).
 */
let transport: EmailTransport | undefined;

function getTransport(): EmailTransport {
  transport ??= createTransport();
  return transport;
}

/**
 * Sends a plain-text email. This is the only way the application sends mail —
 * nothing outside `src/lib/email` should know that SMTP exists.
 *
 * Never throws: a transport failure comes back as `{ ok: false, error }`. With
 * no SMTP credentials configured the message is logged and reported as sent.
 *
 * Requires the Node.js runtime (the Next.js default; do not opt a sending
 * route into the deprecated Edge runtime).
 */
export function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  return sendEmailWith(getTransport(), message);
}

/**
 * Sends the same message to many recipients with bounded concurrency, and
 * reports an outcome per recipient. Google throttles per minute and caps
 * external recipients per day, so prefer this over looping `sendEmail`.
 */
export function sendEmails(
  message: BulkEmailMessage,
  options?: SendEmailsOptions,
): Promise<SendEmailsResult> {
  return sendEmailsWith(getTransport(), message, options);
}
