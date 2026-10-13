import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { createECDH } from "node:crypto"
import { createTestDatabase } from "@test/database"
import { eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { pushSubscription } from "@/core/db/schema/notifications"
import { InvalidNotificationSubscriptionError } from "./subscription-validation"

const database = await createTestDatabase()
if (database) mock.module("@/core/db", () => ({ db: database.db }))
const operations = database ? await import("./subscription") : undefined

describe.skipIf(!database)("push subscription ownership", () => {
  const t = database as NonNullable<typeof database>
  const { subscribe, unsubscribe, hasActiveSubscription } = operations as NonNullable<typeof operations>
  const firstUser = crypto.randomUUID()
  const secondUser = crypto.randomUUID()
  const ecdh = createECDH("prime256v1")
  const subscription = {
    endpoint: "https://fcm.googleapis.com/fcm/send/ownership-test",
    keys: { p256dh: ecdh.generateKeys().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") }
  }

  beforeAll(async () => {
    await t.db.insert(user).values([firstUser, secondUser].map((id) => ({ id, name: id, email: `${id}@example.test` })))
  })
  beforeEach(() => t.db.delete(pushSubscription))
  afterAll(() => t.drop())

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
