import "server-only"

import { logger } from "@/core/logging"
import { getMemberIdSession, issueMemberId, MemberIdError, verifyMemberId } from "./service"

const headers = { "Cache-Control": "no-store, private", Pragma: "no-cache" }

async function respond(operation: () => Promise<unknown>) {
  try {
    return Response.json(await operation(), { headers })
  } catch (error) {
    if (error instanceof MemberIdError) {
      const status = { UNAUTHENTICATED: 401, FORBIDDEN: 403, INVALID_CODE: 400 }[error.code]
      return Response.json({ code: error.code }, { status, headers })
    }
    // Do not log the submitted QR, session cookies, or subject identity.
    logger.error("member_id.request_failed")
    return Response.json({ code: "UNAVAILABLE" }, { status: 503, headers })
  }
}

export async function memberIdSessionResponse() {
  return respond(getMemberIdSession)
}

export async function issueMemberIdResponse() {
  return respond(issueMemberId)
}

/** Accepts only a bounded JSON QR payload. Codes travel in POST bodies, never URL/access logs. */
export async function verifyMemberIdResponse(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ code: "INVALID_REQUEST" }, { status: 415, headers })
  }
  const reader = request.body?.getReader()
  if (!reader) return Response.json({ code: "INVALID_REQUEST" }, { status: 400, headers })
  let body = ""
  let size = 0
  const decoder = new TextDecoder()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 4096) {
        await reader.cancel()
        return Response.json({ code: "INVALID_REQUEST" }, { status: 413, headers })
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
    const input: unknown = JSON.parse(body)
    if (
      typeof input !== "object" ||
      input === null ||
      !("token" in input) ||
      typeof input.token !== "string" ||
      input.token.length > 2048
    ) {
      return Response.json({ code: "INVALID_REQUEST" }, { status: 400, headers })
    }
    const token = input.token
    return respond(() => verifyMemberId(token))
  } catch {
    return Response.json({ code: "INVALID_REQUEST" }, { status: 400, headers })
  } finally {
    reader.releaseLock()
  }
}
