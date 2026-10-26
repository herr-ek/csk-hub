"use client"

import { useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { moveShortcut, toggleShortcut } from "@/core/navigation/quick-access"
import type { MenuRouteId } from "@/core/navigation/site"
import { updateQuickAccess, updateQuickAccessEnabled } from "./actions"

/** Edits the member's bar switch and shortcuts optimistically, saving each change and rolling back if the save fails. */
export function useQuickAccessSettings(saved: { enabled: boolean; shortcuts: MenuRouteId[] }) {
  const t = useTranslations("QuickAccess")
  const routes = useTranslations("Navigation.routes")
  const [enabled, setEnabled] = useState(saved.enabled)
  const [shortcuts, setShortcuts] = useState(saved.shortcuts)
  const [error, setError] = useState<string>()
  const [announcement, setAnnouncement] = useState("")

  async function save(next: MenuRouteId[], message: string) {
    const previous = shortcuts
    setShortcuts(next)
    setError(undefined)
    setAnnouncement(message)
    try {
      const result = await updateQuickAccess(next)
      if (result.success) return
    } catch {}

    setShortcuts(previous)
    setAnnouncement("")
    setError(t("updateFailed"))
  }

  async function setBarEnabled(next: boolean) {
    setEnabled(next)
    setError(undefined)
    setAnnouncement("")
    try {
      const result = await updateQuickAccessEnabled(next)
      if (result.success) return
    } catch {}

    setEnabled(!next)
    setError(t("updateFailed"))
  }

  function toggle(id: MenuRouteId) {
    const next = toggleShortcut(shortcuts, id)
    if (next.length === shortcuts.length) return
    const name = routes(id)
    void save(next, next.includes(id) ? t("added", { name }) : t("removed", { name }))
  }

  function move(id: MenuRouteId, delta: number) {
    const next = moveShortcut(shortcuts, id, delta)
    void save(next, t("moved", { name: routes(id), position: next.indexOf(id) + 1, count: next.length }))
  }

  return { enabled, setBarEnabled, shortcuts, error, announcement, toggle, move }
}
