import { expect, test } from "bun:test"
import { createECDH } from "node:crypto"
import {
  InvalidNotificationSubscriptionError,
  parseNotificationSubscription,
  parsePushEndpoint
} from "./subscription-validation"

const ecdh = createECDH("prime256v1")
const keys = { p256dh: ecdh.generateKeys().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") }
const endpoint = "https://fcm.googleapis.com/fcm/send/channel"

for (const url of [
  endpoint,
  "https://updates.push.services.mozilla.com/wpush/v2/channel",
  "https://web.push.apple.com/channel",
  "https://wns2-db5p.notify.windows.com/w/?token=channel",
  "https://cloud.notify.windows.com/?token=channel%2Btoken",
  "https://cloud.notify.windows.com/",
  "https://fcm.googleapis.com/"
]) {
  test(`accepts supported provider endpoint ${new URL(url).hostname}`, () => {
    expect(parseNotificationSubscription({ endpoint: url, keys }).endpoint).toBe(url)
  })
}

for (const url of [
  "http://fcm.googleapis.com/channel",
  "https://fcm.googleapis.com:8443/channel",
  "https://user:password@fcm.googleapis.com/channel",
  "https://fcm.googleapis.com/channel#fragment",
  "https://127.0.0.1/channel",
  "https://[::1]/channel",
  "https://localhost/channel",
  "https://fcm.googleapis.com.attacker.test/channel",
  "https://evilpush.services.mozilla.com/channel",
  "https://notify.windows.com.attacker.test/?token=channel",
  "https://evilnotify.windows.com/?token=channel",
  ` ${endpoint}`,
  `${endpoint} `,
  "not-a-url",
  `https://fcm.googleapis.com/${"x".repeat(4096)}`
]) {
  test(`rejects unsafe or unsupported endpoint ${url.slice(0, 80)}`, () => {
    expect(() => parsePushEndpoint(url)).toThrow(InvalidNotificationSubscriptionError)
  })
}

test("canonicalizes provider host casing", () => {
  expect(parsePushEndpoint("https://FCM.GOOGLEAPIS.COM/fcm/send/channel")).toBe(endpoint)
})

for (const input of [
  null,
  [],
  { endpoint },
  { endpoint, keys: null },
  { endpoint, keys: { ...keys, p256dh: "bad" } },
  { endpoint, keys: { ...keys, p256dh: Buffer.alloc(65).toString("base64url") } },
  { endpoint, keys: { ...keys, auth: `${keys.auth}=` } },
  { endpoint, keys: { ...keys, auth: "!".repeat(22) } },
  { endpoint, keys, expirationTime: -1 },
  { endpoint, keys, expirationTime: 0.5 },
  { endpoint, keys, expirationTime: Number.NaN },
  { endpoint, keys, expirationTime: 8.64e15 + 1 },
  { endpoint, keys, userAgent: "x".repeat(1025) },
  { endpoint, keys, deviceLabel: "x".repeat(121) }
]) {
  test(`rejects invalid subscription input ${JSON.stringify(input).slice(0, 100)}`, () => {
    expect(() => parseNotificationSubscription(input)).toThrow(InvalidNotificationSubscriptionError)
  })
}

test("preserves bounded optional metadata and discards unrelated properties", () => {
  expect(
    parseNotificationSubscription({
      endpoint,
      keys,
      expirationTime: null,
      userAgent: "Browser",
      deviceLabel: "Phone",
      owner: "other-user"
    })
  ).toEqual({
    endpoint,
    keys,
    expirationTime: null,
    userAgent: "Browser",
    deviceLabel: "Phone"
  })
})
