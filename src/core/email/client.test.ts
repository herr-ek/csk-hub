import { describe, expect, mock, test } from "bun:test"

mock.module("server-only", () => ({}))

const { createEmailClient } = await import("./client")

const smtp = {
  host: "smtp.example.com",
  port: 587,
  secure: false,
  user: "mailer@example.com",
  pass: "app-password",
  from: "CSK Hub <mailer@example.com>"
}

describe("email client", () => {
  test("logs messages and reports successful local delivery", async () => {
    const log = mock(() => undefined)
    const client = createEmailClient({ mode: "log", logger: { log, error: mock(() => undefined) } })

    await expect(
      client.send({ to: "member@example.com", subject: "Welcome", body: "Your link" })
    ).resolves.toMatchObject({
      ok: true,
      delivery: "logged"
    })
    expect(log).toHaveBeenCalledWith(
      "[email:log]",
      expect.objectContaining({ to: "member@example.com", subject: "Welcome", body: "Your link" })
    )
  })

  test("returns a typed failure when SMTP delivery fails", async () => {
    const client = createEmailClient({
      mode: "smtp",
      smtp,
      logger: { log: mock(() => undefined), error: mock(() => undefined) },
      sendMail: async () => Promise.reject(new Error("SMTP unavailable"))
    })

    await expect(client.send({ to: "member@example.com", subject: "Welcome", body: "Your link" })).resolves.toEqual({
      ok: false,
      reason: "transport-error",
      error: "Email could not be delivered."
    })
  })

  test("bounds batch delivery concurrency and returns an outcome per recipient", async () => {
    let active = 0
    let peak = 0
    const client = createEmailClient({
      mode: "smtp",
      smtp,
      logger: { log: mock(() => undefined), error: mock(() => undefined) },
      sendMail: async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return { messageId: crypto.randomUUID() }
      }
    })

    const results = await client.sendBatch(
      ["a@example.com", "b@example.com", "c@example.com"].map((to) => ({ to, subject: "Welcome", body: "Your link" })),
      2
    )

    expect(peak).toBe(2)
    expect(results).toHaveLength(3)
    expect(results.every((result) => result.ok)).toBe(true)
  })
})
