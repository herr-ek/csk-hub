/**
 * A single plain-text email. Deliberately the whole vocabulary a caller needs:
 * no headers, no HTML, no transport concepts.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
};

/** The same message addressed to many recipients. */
export type BulkEmailMessage = {
  to: readonly string[];
  subject: string;
  body: string;
};

/**
 * How a message left the application. `logged` means no SMTP credentials were
 * configured and the message was written to the server log instead — the
 * normal state in local development.
 */
export type EmailDelivery = "smtp" | "logged";

export type EmailErrorCode = "invalid-message" | "transport-error";

export type EmailError = {
  code: EmailErrorCode;
  message: string;
  cause?: unknown;
};

/** Sending never throws; every outcome is one of these. */
export type SendEmailResult =
  | { ok: true; delivery: EmailDelivery }
  | { ok: false; error: EmailError };

export type RecipientOutcome = {
  to: string;
  result: SendEmailResult;
};

export type SendEmailsResult = {
  results: RecipientOutcome[];
  sent: number;
  failed: number;
};

export type SendEmailsOptions = {
  /**
   * How many messages may be in flight at once. Google throttles per minute,
   * so this stays low by default.
   */
  concurrency?: number;
};

/**
 * The one seam between the `sendEmail` API and the outside world. Throwing is
 * how a transport reports failure; `sendEmailWith` classifies it.
 */
export type EmailTransport = {
  readonly delivery: EmailDelivery;
  send(message: EmailMessage): Promise<void>;
};

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
};
