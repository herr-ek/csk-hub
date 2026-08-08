import type {
  BulkEmailMessage,
  EmailMessage,
  EmailTransport,
  RecipientOutcome,
  SendEmailResult,
  SendEmailsOptions,
  SendEmailsResult,
} from "./types";

const DEFAULT_CONCURRENCY = 4;

function describe(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

function validate(message: EmailMessage): string | null {
  // Deliberately shallow: SMTP is the real authority on whether an address
  // exists. This only catches obvious nonsense (blank, unset) before opening a
  // connection — an empty string trivially fails the "@" test.
  if (!message.to.trim().includes("@")) {
    return `not an email address: "${message.to}"`;
  }
  if (!message.subject.trim()) return "subject is empty";
  return null;
}

/**
 * Sends one message through the given transport, converting every failure into
 * a result. Never throws.
 */
export async function sendEmailWith(
  transport: EmailTransport,
  message: EmailMessage,
): Promise<SendEmailResult> {
  const invalid = validate(message);
  if (invalid) {
    return { ok: false, error: { code: "invalid-message", message: invalid } };
  }

  try {
    await transport.send(message);
    return { ok: true, delivery: transport.delivery };
  } catch (cause) {
    return {
      ok: false,
      error: { code: "transport-error", message: describe(cause), cause },
    };
  }
}

/**
 * Sends the same message to many recipients, at most `concurrency` at a time,
 * and reports an outcome for each. Never throws.
 */
export async function sendEmailsWith(
  transport: EmailTransport,
  message: BulkEmailMessage,
  options: SendEmailsOptions = {},
): Promise<SendEmailsResult> {
  const recipients = [...new Set(message.to)];
  const results: RecipientOutcome[] = new Array(recipients.length);

  const limit = Math.max(
    1,
    Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY),
  );
  const workers = Math.min(limit, recipients.length);

  let next = 0;
  async function worker() {
    while (next < recipients.length) {
      const index = next++;
      const to = recipients[index];
      results[index] = {
        to,
        result: await sendEmailWith(transport, {
          to,
          subject: message.subject,
          body: message.body,
        }),
      };
    }
  }

  await Promise.all(Array.from({ length: workers }, worker));

  const failed = results.filter((entry) => !entry.result.ok).length;
  return { results, sent: results.length - failed, failed };
}
