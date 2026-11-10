import "server-only"

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto"
import { z } from "zod"

export const MEMBER_ID_VALIDITY_MS = 10_000
export const MEMBER_ID_ROTATION_MS = 5_000
const prefix = "csk-id:1:"
const claimsSchema = z.object({ userId: z.string().min(1), sessionId: z.string().min(1), issuedAt: z.number().int() })
type Claims = z.infer<typeof claimsSchema>

function key(secret: string) {
  return Buffer.from(hkdfSync("sha256", secret, "csk-member-id-v1", "qr-encryption", 32))
}

/** Seals identity/session references without exposing them to QR readers. Never use this as a login token. */
export function issueMemberIdToken(claims: Claims, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key(secret), iv)
  cipher.setAAD(Buffer.from(prefix))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(claims), "utf8"), cipher.final()])
  return prefix + Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")
}

/** Returns null for malformed, forged, future-dated or expired codes; expiry is exclusive. */
export function readMemberIdToken(token: string, secret: string, now: number): Claims | null {
  if (!token.startsWith(prefix) || token.length > 2048) return null
  try {
    const encoded = token.slice(prefix.length)
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null
    const data = Buffer.from(encoded, "base64url")
    if (data.length < 29) return null
    const decipher = createDecipheriv("aes-256-gcm", key(secret), data.subarray(0, 12))
    decipher.setAAD(Buffer.from(prefix))
    decipher.setAuthTag(data.subarray(12, 28))
    const plaintext = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()])
    const result = claimsSchema.safeParse(JSON.parse(plaintext.toString("utf8")))
    if (!result.success || result.data.issuedAt > now || now - result.data.issuedAt >= MEMBER_ID_VALIDITY_MS)
      return null
    return result.data
  } catch {
    return null
  }
}
