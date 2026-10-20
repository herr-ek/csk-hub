import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test"
import * as session from "@/core/authz"
import { db } from "@/core/db"
import * as messaging from "@/features/messaging/reading"
import { getProfile } from "./query"
import * as service from "./service"

const viewer = { userId: "viewer", isAdmin: false, impersonatedBy: null } as Awaited<
  ReturnType<typeof session.requirePermission>
>

const member: NonNullable<Awaited<ReturnType<typeof service.getMemberProfile>>> = {
  id: "member",
  name: "Member",
  username: null,
  image: null,
  email: null,
  isOwn: false,
  capabilities: [],
  choirs: [],
  groups: [],
  otherGroups: [],
  positions: []
}

const capability = spyOn(session, "can")
const sessionRead = spyOn(session, "requirePermission")
const profileRead = spyOn(service, "getMemberProfile")
const conversationRead = spyOn(messaging, "findDirectConversation")

beforeEach(() => {
  capability.mockReset().mockResolvedValue(false)
  sessionRead.mockReset().mockResolvedValue(viewer)
  profileRead.mockReset().mockResolvedValue(member)
  conversationRead.mockReset().mockResolvedValue("conversation-1")
})

afterAll(() => {
  capability.mockRestore()
  sessionRead.mockRestore()
  profileRead.mockRestore()
  conversationRead.mockRestore()
})

describe("profile conversation visibility", () => {
  test("exposes an existing Conversation only after a valid profile read", async () => {
    expect(await getProfile("member")).toMatchObject({
      canMessage: true,
      messageConversationId: "conversation-1"
    })
    expect(conversationRead).toHaveBeenCalledWith(db, "viewer", "member")
  })

  test("does not expose a Conversation for an inactive or missing member", async () => {
    profileRead.mockResolvedValueOnce(null)
    await expect(getProfile("member")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
  })

  test("does not expose a Conversation to an inactive viewer", async () => {
    profileRead.mockRejectedValueOnce(new service.InactiveViewerError())
    await expect(getProfile("member")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
  })

  test("does not look up Conversations while impersonating", async () => {
    sessionRead.mockResolvedValueOnce({ ...viewer, impersonatedBy: "admin" })
    expect(await getProfile("member")).toMatchObject({ canMessage: false, messageConversationId: null })
    expect(conversationRead).not.toHaveBeenCalled()
  })
})
