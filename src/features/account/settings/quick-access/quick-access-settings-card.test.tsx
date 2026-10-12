import { afterEach, describe, expect, mock, test } from "bun:test"
import { registerDom } from "@test/dom"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { MenuRouteId } from "@/core/navigation/site"

registerDom()
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Translation keys stand in for copy, with interpolated values appended, so assertions don't depend on wording.
mock.module("@/core/i18n/translations", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join(",")})` : key
}))
const updateQuickAccess = mock(async (_shortcuts: MenuRouteId[]) => ({ success: true as const }))
const updateQuickAccessEnabled = mock(async (_enabled: boolean) => ({ success: true as const }))
mock.module("./actions", () => ({ updateQuickAccess, updateQuickAccessEnabled }))

const { QuickAccessSettingsCard } = await import("./QuickAccessSettingsCard")

const eligible: MenuRouteId[] = ["news", "newsCompose", "messages", "account", "accountSettings"]
let root: Root | undefined
let container: HTMLElement | undefined

async function renderCard(shortcuts: MenuRouteId[], enabled = true) {
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root?.render(<QuickAccessSettingsCard saved={{ enabled, shortcuts }} eligible={eligible} />)
  })
  return container
}

function checkbox(view: HTMLElement, id: MenuRouteId) {
  const label = view.querySelector(`label[for="quick-access-${id}"]`)
  const box = label?.parentElement?.querySelector('[role="checkbox"]')
  if (!box) throw new Error(`No checkbox for ${id}`)
  return box
}

afterEach(async () => {
  await act(async () => root?.unmount())
  container?.remove()
  updateQuickAccess.mockClear()
  updateQuickAccessEnabled.mockClear()
})

describe("QuickAccessSettingsCard", () => {
  test("lists the saved shortcuts in bar order", async () => {
    const view = await renderCard(["messages", "news"])
    const pinned = [...view.querySelectorAll("ol li")].map((item) => item.textContent)
    expect(pinned).toEqual(["messages", "news"])
  })

  test("stops offering more pages once the bar is full", async () => {
    const view = await renderCard(["news", "newsCompose", "messages", "account"])
    expect(checkbox(view, "accountSettings").getAttribute("aria-disabled")).toBe("true")
    expect(checkbox(view, "news").getAttribute("aria-disabled")).not.toBe("true")
  })

  test("turning the bar off saves the switch and hides the shortcut editor", async () => {
    const view = await renderCard(["news", "messages"])
    const toggle = view.querySelector('[role="switch"]')
    if (!(toggle instanceof HTMLElement)) throw new Error("No quick-access switch")
    await act(async () => toggle.click())
    expect(updateQuickAccessEnabled).toHaveBeenLastCalledWith(false)
    expect(view.querySelector("ol")).toBeNull()
    expect(view.querySelector('[role="checkbox"]')).toBeNull()
    expect(updateQuickAccess).not.toHaveBeenCalled()
  })

  test("shows the shortcut editor again when the bar is turned back on", async () => {
    const view = await renderCard(["news"], false)
    expect(view.querySelector("ol")).toBeNull()
    const toggle = view.querySelector('[role="switch"]')
    if (!(toggle instanceof HTMLElement)) throw new Error("No quick-access switch")
    await act(async () => toggle.click())
    expect(updateQuickAccessEnabled).toHaveBeenLastCalledWith(true)
    expect([...view.querySelectorAll("ol li")].map((item) => item.textContent)).toEqual(["news"])
  })

  test("saves the new order when a shortcut moves", async () => {
    const view = await renderCard(["news", "messages"])
    const moveUp = view.querySelector('button[aria-label="moveUp(messages)"]')
    if (!(moveUp instanceof HTMLButtonElement)) throw new Error("No move-up button for Messages")
    await act(async () => moveUp.click())
    expect(updateQuickAccess).toHaveBeenLastCalledWith(["messages", "news"])
    const pinned = [...view.querySelectorAll("ol li")].map((item) => item.textContent)
    expect(pinned).toEqual(["messages", "news"])
  })
})
