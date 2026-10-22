import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test"
import * as permissions from "@/core/auth/permissions.server"
import * as session from "@/core/auth/session.server"
import { db } from "@/core/db"
import * as messaging from "@/features/messaging/reading"
import * as organisation from "@/features/org-structure-management"
import { getProfile } from "./query"
import * as service from "./service"

const viewer = {
  user: { id: "viewer" },
  session: { impersonatedBy: null }
} as NonNullable<Awaited<ReturnType<typeof session.getRequestSession>>>

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

const sessionRead = spyOn(session, "getRequestSession")
const profileRead = spyOn(service, "getMemberProfile")
const conversationRead = spyOn(messaging, "findDirectConversation")
const labelsRead = spyOn(organisation, "listLocalizedGroupLabels")
const adminRead = spyOn(permissions, "isUserAdmin")

beforeEach(() => {
  labelsRead.mockReset().mockResolvedValue(new Map())
  sessionRead.mockReset().mockResolvedValue(viewer)
  profileRead.mockReset().mockResolvedValue(member)
  conversationRead.mockReset().mockResolvedValue("conversation-1")
  adminRead.mockReset().mockResolvedValue(false)
})

afterAll(() => {
  labelsRead.mockRestore()
  sessionRead.mockRestore()
  profileRead.mockRestore()
  conversationRead.mockRestore()
  adminRead.mockRestore()
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
    sessionRead.mockResolvedValueOnce({ ...viewer, session: { ...viewer.session, impersonatedBy: "admin" } })
    expect(await getProfile("member")).toMatchObject({ canMessage: false, messageConversationId: null })
    expect(conversationRead).not.toHaveBeenCalled()
  })

  test("keeps organisation correction history behind the Admin check", async () => {
    const result = await getProfile("member")
    expect(result.canManageOrganisation).toBe(false)
    expect(result.managementRecords).toBeNull()
    expect(adminRead).toHaveBeenCalledWith(viewer)
  })
})
