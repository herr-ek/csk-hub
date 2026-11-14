"use client"

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"

const STORAGE_PREFIX = "csk-hub.unsaved."

type Stored = { version: string; value: unknown }

// Storage can be missing or refuse writes — a private window, a full quota — and losing the
// copy must never break the form itself, so every access tolerates failure.
function readStored(key: string): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (!raw) return null
    const stored: Partial<Stored> = JSON.parse(raw)
    return typeof stored.version === "string" ? { version: stored.version, value: stored.value } : null
  } catch {
    return null
  }
}

function writeStored(key: string, stored: Stored) {
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(stored))
  } catch {
    // Nothing to do: the form still works, it just cannot survive a reload.
  }
}

function removeStored(key: string) {
  try {
    window.sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`)
  } catch {
    // As above.
  }
}

/**
 * Keeps what has been typed into a form but not yet saved, so a reload or an accidental
 * navigation does not lose it, and warns before the page is left with such changes. The copy
 * lives in this browser tab only — it is gone when the tab closes, so nothing private is left on
 * a shared computer — and is dropped once a save succeeds.
 *
 * `storageKey` names the form and what it edits, and `version` the saved state the copy was made
 * from: a copy of an older version is thrown away rather than laid over newer content. `parse`
 * checks a stored copy, which may come from an older build, returning null to throw it away.
 *
 * After a mount the hook may report `restored`, which the form should start from. Call `keep`
 * with the whole form on every edit, `saving` when it submits, `saveFailed` when the action hands
 * it back an error, and `saved` when a save succeeds without leaving the page.
 */
export function useUnsavedForm<T>({
  storageKey,
  version,
  parse
}: {
  storageKey: string
  version: string
  parse: (value: unknown) => T | null
}) {
  const [restored, setRestored] = useState<T | null>(null)
  const hasCopy = useRef(false)
  const savingNow = useRef(false)
  // An effect event, so a caller's inline `parse` does not re-run the restore.
  const parseStored = useEffectEvent(parse)

  // Storage is read once, after hydration, so the server and the first client render agree.
  useEffect(() => {
    const stored = readStored(storageKey)
    if (!stored) return
    const value = stored.version === version ? parseStored(stored.value) : null
    if (value === null) {
      removeStored(storageKey)
      return
    }
    hasCopy.current = true
    setRestored(value)
  }, [storageKey, version])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasCopy.current && !savingNow.current) event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => {
      window.removeEventListener("beforeunload", warn)
      // Leaving while a save is underway means it went through: the action navigates away
      // only on success, and a failure keeps the form, and this hook, mounted.
      if (savingNow.current) removeStored(storageKey)
    }
  }, [storageKey])

  // Stable, so a form can react to its own state settling without these changing under it:
  // a submission that follows a failed one must not be marked failed too.
  const saving = useCallback(() => {
    savingNow.current = true
  }, [])
  const saveFailed = useCallback(() => {
    savingNow.current = false
  }, [])

  const keep = useCallback(
    (value: T) => {
      hasCopy.current = true
      writeStored(storageKey, { version, value })
    },
    [storageKey, version]
  )

  /** Drops the copy once the form's content is safely stored, while the form stays open. */
  const saved = useCallback(() => {
    removeStored(storageKey)
    hasCopy.current = false
    savingNow.current = false
  }, [storageKey])

  /** Throws the kept copy away, so the form goes back to the saved content. */
  const discard = useCallback(() => {
    removeStored(storageKey)
    hasCopy.current = false
    setRestored(null)
  }, [storageKey])

  return { restored, keep, saving, saveFailed, saved, discard }
}
