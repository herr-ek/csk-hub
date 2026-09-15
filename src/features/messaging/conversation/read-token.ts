import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"
import { env } from "@/core/config/env"

function signature(value: string) {
  return createHmac("sha256", env.BETTER_AUTH_SECRET).update(value).digest("base64url")
}

export function createReadToken(conversationId: string, userId: string, sequence: number) {
  const value = `${conversationId}:${userId}:${sequence}`
  return `${value}:${signature(value)}`
}

export function verifiesReadToken(token: string, conversationId: string, userId: string, sequence: number) {
  const value = `${conversationId}:${userId}:${sequence}`
  const expected = signature(value)
  const provided = token.slice(value.length + 1)
  return (
    token.startsWith(`${value}:`) &&
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  )
}
