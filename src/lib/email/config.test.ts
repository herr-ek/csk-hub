import { describe, expect, test } from "bun:test";
import { readSmtpConfig } from "./config";

const credentials = {
  SMTP_USER: "webmaster@choir.chs.chalmers.se",
  SMTP_PASSWORD: "app-password",
};

describe("readSmtpConfig", () => {
  test("reports not configured when no variables are set", () => {
    const result = readSmtpConfig({});

    expect(result.configured).toBe(false);
  });

  test("names the missing variables so the reason is actionable", () => {
    const result = readSmtpConfig({ SMTP_USER: credentials.SMTP_USER });

    expect(result).toMatchObject({ configured: false });
    if (result.configured) throw new Error("expected not configured");
    expect(result.reason).toContain("SMTP_PASSWORD");
  });

  test("treats blank credentials as absent", () => {
    const result = readSmtpConfig({ SMTP_USER: "  ", SMTP_PASSWORD: "  " });

    expect(result.configured).toBe(false);
  });

  test("defaults to Google Workspace SMTP on the STARTTLS port", () => {
    const result = readSmtpConfig(credentials);

    if (!result.configured) throw new Error(result.reason);
    expect(result.config.host).toBe("smtp.gmail.com");
    expect(result.config.port).toBe(587);
  });

  test("allows host and port to be overridden", () => {
    const result = readSmtpConfig({
      ...credentials,
      SMTP_HOST: "smtp.example.org",
      SMTP_PORT: "2525",
    });

    if (!result.configured) throw new Error(result.reason);
    expect(result.config.host).toBe("smtp.example.org");
    expect(result.config.port).toBe(2525);
  });

  test("falls back to the SMTP user as the From address", () => {
    const result = readSmtpConfig(credentials);

    if (!result.configured) throw new Error(result.reason);
    expect(result.config.from).toBe(credentials.SMTP_USER);
  });

  test("prefers EMAIL_FROM over the SMTP user", () => {
    const result = readSmtpConfig({
      ...credentials,
      EMAIL_FROM: "CSK Hub <webmaster@choir.chs.chalmers.se>",
    });

    if (!result.configured) throw new Error(result.reason);
    expect(result.config.from).toBe(
      "CSK Hub <webmaster@choir.chs.chalmers.se>",
    );
  });

  test("refuses a malformed port rather than silently using the default", () => {
    const result = readSmtpConfig({ ...credentials, SMTP_PORT: "not-a-port" });

    expect(result).toMatchObject({ configured: false });
    if (result.configured) throw new Error("expected not configured");
    expect(result.reason).toContain("SMTP_PORT");
  });

  test("refuses an out-of-range port", () => {
    for (const port of ["0", "70000", "-1", "587.5"]) {
      const result = readSmtpConfig({ ...credentials, SMTP_PORT: port });
      expect(result.configured).toBe(false);
    }
  });
});
