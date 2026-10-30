import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test"
import * as session from "@/core/auth/session.server"
import { db } from "@/core/db"
import * as messaging from "@/features/messaging/reading"
import * as organisation from "@/features/org-structure"
import * as careerService from "./career/service"
import { getCareer, getProfile } from "./query"
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
const careerRead = spyOn(careerService, "getMemberCareer")

beforeEach(() => {
  labelsRead.mockReset().mockResolvedValue(new Map())
  sessionRead.mockReset().mockResolvedValue(viewer)
  profileRead.mockReset().mockResolvedValue(member)
  conversationRead.mockReset().mockResolvedValue("conversation-1")
  careerRead.mockReset().mockResolvedValue({
    person: { id: "member", name: "Member", image: null },
    isOwn: false,
    through: "2026-10-22",
    records: []
  })
})

afterAll(() => {
  labelsRead.mockRestore()
  sessionRead.mockRestore()
  profileRead.mockRestore()
  conversationRead.mockRestore()
  careerRead.mockRestore()
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

  test("profiles no longer load or expose Admin organisation management records", async () => {
    const result = await getProfile("member")
    expect(result).not.toHaveProperty("canManageOrganisation")
    expect(result).not.toHaveProperty("managementRecords")
  })

  test("a regular signed-in viewer can read another member's career", async () => {
    expect(await getCareer("member")).toMatchObject({ person: { id: "member" }, records: [] })
    expect(careerRead).toHaveBeenCalledWith(db, "viewer", "member")
  })

  test("career access redirects anonymous visitors and hides missing or inactive profiles", async () => {
    sessionRead.mockResolvedValueOnce(null)
    await expect(getCareer("member")).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") })
    expect(careerRead).not.toHaveBeenCalled()
    careerRead.mockResolvedValueOnce(null)
    await expect(getCareer("member")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
    careerRead.mockRejectedValueOnce(new service.InactiveViewerError())
    await expect(getCareer("member")).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })
  })
})
