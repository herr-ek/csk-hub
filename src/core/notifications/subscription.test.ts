import { afterAll, beforeAll, beforeEach, describe, expect, mock, spyOn, test } from "bun:test"
import { createECDH } from "node:crypto"
import { createTestDatabase } from "@test/database"
import { eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { pushSubscription } from "@/core/db/schema/notifications"
import { InvalidNotificationSubscriptionError } from "./subscription-validation"

// Real database/transport checks run separately so their mocks cannot leak into other files.
if (process.env.CSK_NOTIFICATION_TEST_FILE !== import.meta.path) {
  test("subscription lifecycle and eligibility in an isolated process", async () => {
    const child = Bun.spawn([process.execPath, "test", import.meta.path], {
      env: { ...process.env, CSK_NOTIFICATION_TEST_FILE: import.meta.path },
      stdout: "pipe",
      stderr: "pipe"
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text()
    ])
    if (exitCode !== 0) throw new Error(`${stdout}\n${stderr}`)
  }, 15_000)
} else {
  const database = await createTestDatabase()
  if (database) mock.module("@/core/db", () => ({ db: database.db }))
  const operations = await import("./subscription")
  const webpush = (await import("web-push")).default
  const sendNotification = spyOn(webpush, "sendNotification").mockResolvedValue({
    statusCode: 201,
    body: "",
    headers: {}
  })
  const delivery = await import("./send-push-notification")

  describe.skipIf(!database)("push subscription ownership", () => {
    const t = database as NonNullable<typeof database>
    const { subscribe, unsubscribe, hasActiveSubscription, listUsersWithActiveSubscriptions } = operations
    const firstUser = crypto.randomUUID()
    const secondUser = crypto.randomUUID()
    const ecdh = createECDH("prime256v1")
    const subscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/ownership-test",
      keys: { p256dh: ecdh.generateKeys().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") }
    }

    beforeAll(async () => {
      await t.db
        .insert(user)
        .values([firstUser, secondUser].map((id) => ({ id, name: id, email: `${id}@example.test` })))
    })
    beforeEach(async () => {
      await t.db.delete(pushSubscription)
      await t.db.update(user).set({ banned: false })
      sendNotification.mockClear()
    })
    afterAll(async () => {
      sendNotification.mockRestore()
      await t.drop()
    })

    test("inactive Users are excluded from every delivery operation and the picker", async () => {
      await subscribe(firstUser, subscription)
      await t.db.update(user).set({ banned: true }).where(eq(user.id, firstUser))
      for (const send of [
        () => delivery.sendToAll("Hello"),
        () => delivery.sendToUsers([firstUser], "Hello"),
        () => delivery.sendToUser(firstUser, "Hello")
      ]) {
        expect(await send()).toMatchObject({ accepted: 0, error: "noActiveSubscriptions" })
      }
      expect(await listUsersWithActiveSubscriptions()).toEqual([])
      expect(await listUsersWithActiveSubscriptions(firstUser)).toEqual([])
      expect(sendNotification).not.toHaveBeenCalled()
      expect(await t.db.select().from(pushSubscription)).toMatchObject([{ status: "active" }])
    })

    test("false and null activity flags remain eligible", async () => {
      await subscribe(firstUser, subscription)
      await subscribe(secondUser, { ...subscription, endpoint: `${subscription.endpoint}-second` })
      await t.db.update(user).set({ banned: null }).where(eq(user.id, secondUser))
      expect(await delivery.sendToAll("Hello")).toMatchObject({ accepted: 2, failed: 0 })
      expect(await delivery.sendToUsers([secondUser], "Hello")).toMatchObject({ accepted: 1, failed: 0 })
      expect(await delivery.sendToUser(firstUser, "Hello")).toMatchObject({ accepted: 1, failed: 0 })
      expect((await listUsersWithActiveSubscriptions()).map(({ id }) => id).sort()).toEqual(
        [firstUser, secondUser].sort()
      )
      expect((await listUsersWithActiveSubscriptions(`${firstUser}@example.test`)).map(({ id }) => id)).toEqual([
        firstUser
      ])
      await t.db.update(user).set({ banned: true }).where(eq(user.id, secondUser))
      expect(await delivery.sendToUsers([firstUser, secondUser], "Hello")).toMatchObject({ accepted: 1 })
    })

    test("reactivation restores eligibility without changing healthy device bindings", async () => {
      await subscribe(firstUser, subscription)
      await t.db.update(user).set({ banned: true }).where(eq(user.id, firstUser))
      expect(await delivery.sendToUser(firstUser, "Hello")).toMatchObject({ accepted: 0 })
      await t.db.update(user).set({ banned: false }).where(eq(user.id, firstUser))
      expect(await delivery.sendToUser(firstUser, "Hello")).toMatchObject({ accepted: 1 })
      expect(await listUsersWithActiveSubscriptions()).toHaveLength(1)
      await t.db.update(pushSubscription).set({ status: "disabled" })
      await t.db.update(user).set({ banned: true }).where(eq(user.id, firstUser))
      await t.db.update(user).set({ banned: false }).where(eq(user.id, firstUser))
      expect(await delivery.sendToUser(firstUser, "Hello")).toMatchObject({ accepted: 0 })
      expect(await listUsersWithActiveSubscriptions()).toEqual([])
    })

    test("rebinding transfers the one endpoint row and refreshes keys and lifecycle", async () => {
      await subscribe(firstUser, subscription)
      await t.db
        .update(pushSubscription)
        .set({ status: "disabled", failureCount: 3, disabledAt: new Date(), disabledReason: "old failure" })
      const refreshed = {
        ...subscription,
        keys: { ...subscription.keys, auth: Buffer.alloc(16, 2).toString("base64url") },
        deviceLabel: "New browser"
      }
      await subscribe(secondUser, refreshed)
      const rows = await t.db.select().from(pushSubscription)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        userId: secondUser,
        auth: refreshed.keys.auth,
        deviceLabel: "New browser",
        status: "active",
        failureCount: 0,
        disabledAt: null,
        disabledReason: null
      })
      expect(await hasActiveSubscription(firstUser, subscription.endpoint)).toBe(false)
      expect(await hasActiveSubscription(secondUser, subscription.endpoint)).toBe(true)
    })

    test("only an endpoint's current owner can remove it", async () => {
      await subscribe(firstUser, subscription)
      expect(await unsubscribe(secondUser, subscription.endpoint)).toBe(false)
      expect(await hasActiveSubscription(firstUser, subscription.endpoint)).toBe(true)
      expect(await unsubscribe(firstUser, subscription.endpoint)).toBe(true)
      expect(await hasActiveSubscription(firstUser, subscription.endpoint)).toBe(false)
      expect(await unsubscribe(firstUser, subscription.endpoint)).toBe(false)
    })

    test("disabled rows do not count as active bindings", async () => {
      await subscribe(firstUser, subscription)
      await t.db.update(pushSubscription).set({ status: "disabled" }).where(eq(pushSubscription.userId, firstUser))
      expect(await hasActiveSubscription(firstUser, subscription.endpoint)).toBe(false)
    })

    test("invalid input cannot overwrite an existing owner's binding", async () => {
      await subscribe(firstUser, subscription)
      await expect(
        subscribe(secondUser, { ...subscription, keys: { p256dh: "invalid", auth: "invalid" } })
      ).rejects.toThrow(InvalidNotificationSubscriptionError)
      expect(await hasActiveSubscription(firstUser, subscription.endpoint)).toBe(true)
      expect(await hasActiveSubscription(secondUser, subscription.endpoint)).toBe(false)
    })

    test("unsupported lookup and removal reject without changing stored rows", async () => {
      await subscribe(firstUser, subscription)
      const unsupported = "https://unsupported.example/channel"
      await expect(hasActiveSubscription(firstUser, unsupported)).rejects.toThrow(InvalidNotificationSubscriptionError)
      await expect(unsubscribe(firstUser, unsupported)).rejects.toThrow(InvalidNotificationSubscriptionError)
      expect(await hasActiveSubscription(firstUser, subscription.endpoint)).toBe(true)
    })
  })
}
