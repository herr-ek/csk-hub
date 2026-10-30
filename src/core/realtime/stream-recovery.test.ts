import { afterEach, describe, expect, mock, test } from "bun:test"

if (!process.env.CSK_STREAM_RECOVERY_TEST) {
  test("SSE establishment failures retain the browser reconnect contract", async () => {
    const child = Bun.spawn([process.execPath, "test", "--isolate", import.meta.path], {
      env: { ...process.env, CSK_STREAM_RECOVERY_TEST: "1" },
      stdout: "pipe",
      stderr: "pipe"
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited
    ])
    if (code !== 0) throw new Error(`${stdout}\n${stderr}`)
  })
} else {
  mock.module("@/core/config/env", () => ({ env: { REDIS_URL: "redis://localhost:6379" } }))
  mock.module("@/core/db", () => ({ db: {} }))
  mock.module("./access", () => ({
    getActivitySession: async () => ({ userId: "recipient", sessionId: "session" }),
    isActivitySessionActive: async () => true
  }))
  const connect = mock()
  mock.module("@/core/realtime/broker", () => ({
    connectActivityBroker: connect,
    activityStreamKey: () => "recipient-stream"
  }))
  const { handleActivityStream } = await import("./stream")
  const policy = { canDeliver: async () => true, isAlreadyOpened: async () => false }
  afterEach(() => connect.mockReset())

  async function expectReconnectResponse() {
    const response = await handleActivityStream(policy, new Request("http://localhost/api/realtime/events"))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/event-stream")
    expect(await response.text()).toBe("retry: 5000\nevent: unavailable\ndata: {}\n\n")
  }

  describe("Redis outage during SSE establishment", () => {
    test("connection failure produces a reconnectable stream", async () => {
      connect.mockRejectedValueOnce(new Error("Redis unavailable"))
      await expectReconnectResponse()
    })

    test("failure reading the initial cursor closes Redis and remains reconnectable", async () => {
      const destroy = mock()
      connect.mockResolvedValueOnce({
        withCommandOptions: () => ({
          xRevRange: async () => {
            throw new Error("Connection lost")
          }
        }),
        destroy
      })
      await expectReconnectResponse()
      expect(destroy).toHaveBeenCalledTimes(1)
    })
  })
}
