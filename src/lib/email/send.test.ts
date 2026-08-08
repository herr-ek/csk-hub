import { describe, expect, test } from "bun:test";
import { sendEmailsWith, sendEmailWith } from "./send";
import type { EmailMessage, EmailTransport } from "./types";

type RecordingTransport = EmailTransport & { readonly sent: EmailMessage[] };

function recordingTransport(
  options: { onSend?: (message: EmailMessage) => Promise<void> } = {},
): RecordingTransport {
  const sent: EmailMessage[] = [];
  return {
    delivery: "smtp",
    sent,
    async send(message) {
      sent.push(message);
      await options.onSend?.(message);
    },
  };
}

function failingTransport(error: unknown): EmailTransport {
  return {
    delivery: "smtp",
    async send() {
      throw error;
    },
  };
}

const message = {
  to: "singer@example.org",
  subject: "Reset your password",
  body: "Follow this link: https://hub.example/reset/abc",
};

describe("sendEmailWith", () => {
  test("hands the message to the transport and reports success", async () => {
    const transport = recordingTransport();

    const result = await sendEmailWith(transport, message);

    expect(result).toEqual({ ok: true, delivery: "smtp" });
    expect(transport.sent).toEqual([message]);
  });

  test("reports how the message was delivered", async () => {
    const transport: EmailTransport = { delivery: "logged", async send() {} };

    const result = await sendEmailWith(transport, message);

    expect(result).toEqual({ ok: true, delivery: "logged" });
  });

  test("turns a transport error into a typed failure instead of throwing", async () => {
    const transport = failingTransport(new Error("535 auth failed"));

    const result = await sendEmailWith(transport, message);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "transport-error" },
    });
    if (result.ok) throw new Error("expected failure");
    expect(result.error.message).toContain("535 auth failed");
  });

  test("survives a transport that rejects with a non-Error", async () => {
    const transport = failingTransport("connection reset");

    const result = await sendEmailWith(transport, message);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "transport-error" },
    });
  });

  test("keeps the original rejection as the failure cause", async () => {
    const cause = new Error("ETIMEDOUT");
    const result = await sendEmailWith(failingTransport(cause), message);

    if (result.ok) throw new Error("expected failure");
    expect(result.error.cause).toBe(cause);
  });

  test("rejects a recipient that is not an address, without calling the transport", async () => {
    const transport = recordingTransport();

    for (const to of ["", "   ", "not-an-address"]) {
      const result = await sendEmailWith(transport, { ...message, to });
      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid-message" },
      });
    }

    expect(transport.sent).toEqual([]);
  });

  test("rejects an empty subject, without calling the transport", async () => {
    const transport = recordingTransport();

    const result = await sendEmailWith(transport, { ...message, subject: " " });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid-message" },
    });
    expect(transport.sent).toEqual([]);
  });
});

describe("sendEmailsWith", () => {
  const recipients = ["a@example.org", "b@example.org", "c@example.org"];

  test("reports an outcome per recipient, in the order given", async () => {
    const transport = recordingTransport();

    const result = await sendEmailsWith(transport, {
      to: recipients,
      subject: message.subject,
      body: message.body,
    });

    expect(result.results.map((entry) => entry.to)).toEqual(recipients);
    expect(result.sent).toBe(3);
    expect(result.failed).toBe(0);
  });

  test("one bad recipient does not sink the rest", async () => {
    const transport = recordingTransport({
      onSend: async (sent) => {
        if (sent.to === "b@example.org") throw new Error("550 no such user");
      },
    });

    const result = await sendEmailsWith(transport, {
      to: recipients,
      subject: message.subject,
      body: message.body,
    });

    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    const failure = result.results.find(
      (entry) => entry.to === "b@example.org",
    );
    expect(failure?.result).toMatchObject({
      ok: false,
      error: { code: "transport-error" },
    });
  });

  test("never exceeds the concurrency bound", async () => {
    let inFlight = 0;
    let peak = 0;
    const transport = recordingTransport({
      onSend: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
      },
    });
    const many = Array.from({ length: 12 }, (_, i) => `m${i}@example.org`);

    await sendEmailsWith(
      transport,
      { to: many, subject: message.subject, body: message.body },
      { concurrency: 3 },
    );

    expect(peak).toBe(3);
  });

  test("sends one at a time when asked to", async () => {
    let inFlight = 0;
    let peak = 0;
    const transport = recordingTransport({
      onSend: async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
      },
    });

    await sendEmailsWith(
      transport,
      { to: recipients, subject: message.subject, body: message.body },
      { concurrency: 1 },
    );

    expect(peak).toBe(1);
  });

  test("treats a nonsensical concurrency as one at a time", async () => {
    const transport = recordingTransport();

    const result = await sendEmailsWith(
      transport,
      { to: recipients, subject: message.subject, body: message.body },
      { concurrency: 0 },
    );

    expect(result.sent).toBe(3);
  });

  test("deduplicates repeated recipients so nobody is mailed twice", async () => {
    const transport = recordingTransport();

    const result = await sendEmailsWith(transport, {
      to: ["a@example.org", "a@example.org", "b@example.org"],
      subject: message.subject,
      body: message.body,
    });

    expect(transport.sent).toHaveLength(2);
    expect(result.results).toHaveLength(2);
  });

  test("no recipients is a no-op, not an error", async () => {
    const transport = recordingTransport();

    const result = await sendEmailsWith(transport, {
      to: [],
      subject: message.subject,
      body: message.body,
    });

    expect(result).toEqual({ results: [], sent: 0, failed: 0 });
    expect(transport.sent).toEqual([]);
  });
});
