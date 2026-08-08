export interface OutgoingEmail {
  to: string;
  subject: string;
  body: string;
}

export interface EmailTransport {
  send(email: OutgoingEmail): Promise<void>;
}

/**
 * Placeholder transport: dispatch is a no-op that records the attempt in the
 * server log. A real transport replaces this — until then, anything that sends
 * email still runs end to end, it just does not leave the process.
 */
export const logOnlyTransport: EmailTransport = {
  async send({ to, subject, body }) {
    console.info(`[email] to=${to} subject=${subject}\n${body}`);
  },
};

let transport: EmailTransport = logOnlyTransport;

/** Swap the transport. Intended for the real transport at boot, and for tests. */
export function setEmailTransport(next: EmailTransport): void {
  transport = next;
}

export function sendEmail(email: OutgoingEmail): Promise<void> {
  return transport.send(email);
}
