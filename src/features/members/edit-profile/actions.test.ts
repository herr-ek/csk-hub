import { afterAll, beforeEach, describe, expect, spyOn, test } from "bun:test"
import * as nextCache from "next/cache"
import * as session from "@/core/auth/session.server"
import { db } from "@/core/db"
import { logger } from "@/core/logging"
import { saveProfileAction } from "./actions"
import * as service from "./service"

const actorSession = {
  user: { id: "member-1" },
  session: { impersonatedBy: null }
} as NonNullable<Awaited<ReturnType<typeof session.getRequestSession>>>

const sessionRead = spyOn(session, "getRequestSession")
const save = spyOn(service, "saveOwnVoiceCapabilities")
const revalidate = spyOn(nextCache, "revalidatePath")
const logError = spyOn(logger, "error")

beforeEach(() => {
  sessionRead.mockReset().mockResolvedValue(actorSession)
  save.mockReset().mockResolvedValue({ status: "success", voices: ["B1"] })
  revalidate.mockReset().mockImplementation(() => undefined)
  logError.mockReset().mockImplementation(() => undefined)
})

afterAll(() => {
  // Restore the real read/write modules so database integration tests keep using them.
  sessionRead.mockRestore()
  save.mockRestore()
  revalidate.mockRestore()
  logError.mockRestore()
})

describe("profile save action", () => {
  test("refreshes every localized profile surface after saving the authenticated member", async () => {
    const form = new FormData()
    form.append("voices", "B1")
    expect(await saveProfileAction({ status: "idle" }, form)).toEqual({ status: "success", voices: ["B1"] })
    expect(save).toHaveBeenCalledWith(db, { userId: "member-1", impersonating: false }, ["B1"])
    expect(revalidate.mock.calls).toEqual([
      ["/[locale]/(app)/me", "page"],
      ["/[locale]/(app)/me/edit", "page"],
      ["/[locale]/(app)/members/[memberId]", "page"]
    ])
  })

  test("logs unexpected save failures without exposing their details to the member", async () => {
    save.mockRejectedValueOnce(Object.assign(new Error("private database detail"), { code: "08006" }))
    expect(await saveProfileAction({ status: "idle" }, new FormData())).toEqual({
      status: "error",
      error: "unexpected"
    })
    expect(logError).toHaveBeenCalledWith("members.profile.save-failed", {
      errorCode: "08006",
      errorName: "Error",
      status: 0
    })
    expect(revalidate).not.toHaveBeenCalled()
  })

  test("returns expected validation failures without revalidation or error logging", async () => {
    save.mockResolvedValueOnce({ status: "error", error: "invalid-voices" })
    expect(await saveProfileAction({ status: "idle" }, new FormData())).toEqual({
      status: "error",
      error: "invalid-voices"
    })
    expect(logError).not.toHaveBeenCalled()
    expect(revalidate).not.toHaveBeenCalled()
  })
})
