import { describe, expect, test } from "bun:test";
import {
  createLoggingTransport,
  createSmtpTransport,
  createTransport,
} from "./transport";
import type { SmtpConfig } from "./types";

const config: SmtpConfig = {
  host: "smtp.gmail.com",
  port: 587,
  user: "webmaster@choir.chs.chalmers.se",
  password: "app-password",
  from: "CSK Hub <webmaster@choir.chs.chalmers.se>",
};

const message = {
  to: "singer@example.org",
  subject: "Reset your password",
  body: "Follow this link: https://hub.example/reset/abc",
};

describe("createLoggingTransport", () => {
  test("reports itself as a logging transport", () => {
    expect(createLoggingTransport(() => {}).delivery).toBe("logged");
  });

  test("logs the recipient, subject and full body including links", async () => {
    const lines: string[] = [];
    const transport = createLoggingTransport((line) => lines.push(line));

    await transport.send(message);

    const logged = lines.join("\n");
    expect(logged).toContain("singer@example.org");
    expect(logged).toContain("Reset your password");
    expect(logged).toContain("https://hub.example/reset/abc");
  });
});

describe("createSmtpTransport", () => {
  test("reports itself as an SMTP transport", () => {
    expect(
      createSmtpTransport(config, { sendMail: async () => {} }).delivery,
    ).toBe("smtp");
  });

  test("sends the message as plain text from the configured address", async () => {
    const calls: Record<string, unknown>[] = [];
    const transport = createSmtpTransport(config, {
      sendMail: async (options) => {
        calls.push(options);
      },
    });

    await transport.send(message);

    expect(calls).toEqual([
      {
        from: config.from,
        to: message.to,
        subject: message.subject,
        text: message.body,
      },
    ]);
  });

  test("lets a transport error propagate for the caller to classify", async () => {
    const transport = createSmtpTransport(config, {
      sendMail: async () => {
        throw new Error("535 auth failed");
      },
    });

    expect(transport.send(message)).rejects.toThrow("535 auth failed");
  });
});

describe("createTransport", () => {
  test("falls back to logging when credentials are absent", () => {
    const transport = createTransport({ env: {}, log: () => {} });

    expect(transport.delivery).toBe("logged");
  });

  test("explains once why email is only being logged", () => {
    const lines: string[] = [];
    createTransport({ env: {}, log: (line) => lines.push(line) });

    expect(lines.join("\n")).toContain("SMTP");
  });

  test("uses SMTP when credentials are present", () => {
    const transport = createTransport({
      env: { SMTP_USER: config.user, SMTP_PASSWORD: config.password },
      log: () => {},
    });

    expect(transport.delivery).toBe("smtp");
  });
});
