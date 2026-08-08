import { describe, expect, test } from "bun:test";
import { readSmtpConfig } from "./config";

const credentials = {
  SMTP_USER: "webmaster@choir.chs.chalmers.se",
  SMTP_PASSWORD: "app-password",
};

describe("readSmtpConfig", () => {
  test("reports credentials absent when nothing is set", () => {
    expect(readSmtpConfig({}).status).toBe("absent");
  });

  test("treats blank credentials as absent", () => {
    const result = readSmtpConfig({ SMTP_USER: "  ", SMTP_PASSWORD: "  " });

    expect(result.status).toBe("absent");
  });

  test("half-set credentials are invalid, not absent", () => {
    // The distinction matters: `absent` falls back to logging, so calling this
    // absent would let a half-finished deployment swallow every message.
    const onlyUser = readSmtpConfig({ SMTP_USER: credentials.SMTP_USER });
    const onlyPassword = readSmtpConfig({
      SMTP_PASSWORD: credentials.SMTP_PASSWORD,
    });

    expect(onlyUser.status).toBe("invalid");
    expect(onlyPassword.status).toBe("invalid");
  });

  test("names the missing variable so the reason is actionable", () => {
    const result = readSmtpConfig({ SMTP_USER: credentials.SMTP_USER });

    if (result.status !== "invalid") throw new Error("expected invalid");
    expect(result.reason).toContain("SMTP_PASSWORD");
  });

  test("defaults to Google Workspace SMTP on the STARTTLS port", () => {
    const result = readSmtpConfig(credentials);

    if (result.status !== "configured") throw new Error(result.reason);
    expect(result.config.host).toBe("smtp.gmail.com");
    expect(result.config.port).toBe(587);
  });

  test("allows host and port to be overridden", () => {
    const result = readSmtpConfig({
      ...credentials,
      SMTP_HOST: "smtp.example.org",
      SMTP_PORT: "2525",
    });

    if (result.status !== "configured") throw new Error(result.reason);
    expect(result.config.host).toBe("smtp.example.org");
    expect(result.config.port).toBe(2525);
  });

  test("falls back to the SMTP user as the From address", () => {
    const result = readSmtpConfig(credentials);

    if (result.status !== "configured") throw new Error(result.reason);
    expect(result.config.from).toBe(credentials.SMTP_USER);
  });

  test("prefers EMAIL_FROM over the SMTP user", () => {
    const result = readSmtpConfig({
      ...credentials,
      EMAIL_FROM: "CSK Hub <webmaster@choir.chs.chalmers.se>",
    });

    if (result.status !== "configured") throw new Error(result.reason);
    expect(result.config.from).toBe(
      "CSK Hub <webmaster@choir.chs.chalmers.se>",
    );
  });

  test("a malformed port is invalid, not a silent fallback to the default", () => {
    const result = readSmtpConfig({ ...credentials, SMTP_PORT: "not-a-port" });

    if (result.status !== "invalid") throw new Error("expected invalid");
    expect(result.reason).toContain("SMTP_PORT");
  });

  test("rejects an out-of-range or non-integer port", () => {
    for (const port of ["0", "70000", "-1", "587.5"]) {
      expect(readSmtpConfig({ ...credentials, SMTP_PORT: port }).status).toBe(
        "invalid",
      );
    }
  });
});
