import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { registerDom } from "@test/dom"
import { act } from "react"
import { createRoot } from "react-dom/client"

// Isolate module mocks from the real logout and auth tests in the full suite.
if (process.env.CSK_SESSIONS_TEST_FILE !== import.meta.path) {
  test("session sign-out workflows in an isolated process", async () => {
    const child = Bun.spawn([process.execPath, "test", import.meta.path], {
      env: { ...process.env, CSK_SESSIONS_TEST_FILE: import.meta.path },
      stdout: "pipe",
      stderr: "pipe"
    })
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text()
    ])
    if (exitCode !== 0) throw new Error(`${stdout}\n${stderr}`)
  })
} else {
  registerDom()
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const sessions = ["current", "other"].map((token) => ({ token, expiresAt: new Date(), userAgent: token }))
  const listSessions = mock(async () => ({ data: sessions }))
  const revokeSession = mock(async () => ({ error: null }))
  const logout = mock(
    async (_isImpersonating: boolean): Promise<{ error: { message: string } | null }> => ({
      error: null
    })
  )
  const translate = (key: string) => key
  mock.module("@/core/auth/auth-client", () => ({ authClient: { listSessions, revokeSession } }))
  mock.module("@/core/navigation/logout", () => ({ logout }))
  mock.module("@/core/i18n/translations", () => ({
    useTranslations: () => translate,
    useFormatter: () => ({ dateTime: () => "date" })
  }))
  const { SessionsSettings } = await import("./sessions-settings")
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let navigate: ReturnType<typeof spyOn<typeof window.location, "assign">>

  beforeEach(() => {
    listSessions.mockClear()
    revokeSession.mockReset().mockResolvedValue({ error: null })
    logout.mockReset().mockResolvedValue({ error: null })
    navigate = spyOn(window.location, "assign").mockImplementation(() => undefined)
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    navigate.mockRestore()
  })

  async function signOut(isImpersonating = false, label = "signOut") {
    await act(async () =>
      root.render(<SessionsSettings currentSessionToken="current" isImpersonating={isImpersonating} />)
    )
    const button = [...container.querySelectorAll("button")].find((element) => element.textContent === label)
    expect(button).toBeDefined()
    await act(async () => button?.click())
    return button
  }

  test("current-device sign-out uses the push-cleaning logout flow", async () => {
    await signOut()
    expect(logout).toHaveBeenCalledWith(false)
    expect(revokeSession).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith("/login")
  })

  test("ending impersonation uses the shared flow and returns to the Admin", async () => {
    await signOut(true)
    expect(logout).toHaveBeenCalledWith(true)
    expect(revokeSession).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith("/admin/users")
  })

  test("revoking another device leaves this browser's binding untouched", async () => {
    await signOut(false, "delete")
    expect(revokeSession).toHaveBeenCalledWith({ token: "other" })
    expect(logout).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
    expect(listSessions).toHaveBeenCalledTimes(2)
  })

  for (const failure of ["returned", "thrown"]) {
    test(`${failure} auth errors show localized feedback and release the pending button`, async () => {
      if (failure === "returned") logout.mockResolvedValue({ error: { message: "Auth error" } })
      else logout.mockRejectedValue(new Error("Network unavailable"))
      const button = await signOut()
      expect(container.textContent).toContain("sessionRevokeFailed")
      expect(button?.disabled).toBe(false)
      expect(navigate).not.toHaveBeenCalled()
    })
  }
}
