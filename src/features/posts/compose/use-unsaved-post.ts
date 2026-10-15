import { useCallback, useEffect, useRef, useState } from "react"
import type { RichTextDocument } from "@/features/rich-text"
import { postDocument } from "../post-document"

const STORAGE_PREFIX = "csk-hub.unsaved-post."

/** What the form holds, as the storage keeps it: the body is the editor's document as JSON. */
type StoredPost = { version: string; title: string; body: string | null }

export type UnsavedPost = { title: string; body: RichTextDocument | undefined }

function storageKey(slot: string) {
  return `${STORAGE_PREFIX}${slot}`
}

// Storage can be missing or refuse writes — a private window, a full quota — and losing the
// copy must never break writing the Post itself, so every access tolerates failure.
function readStored(slot: string): StoredPost | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(slot))
    if (!raw) return null
    const value: Partial<StoredPost> = JSON.parse(raw)
    if (typeof value.version !== "string" || typeof value.title !== "string") return null
    return { version: value.version, title: value.title, body: typeof value.body === "string" ? value.body : null }
  } catch {
    return null
  }
}

function writeStored(slot: string, value: StoredPost) {
  try {
    window.sessionStorage.setItem(storageKey(slot), JSON.stringify(value))
  } catch {
    // Nothing to do: the form still works, it just cannot survive a reload.
  }
}

function removeStored(slot: string) {
  try {
    window.sessionStorage.removeItem(storageKey(slot))
  } catch {
    // As above.
  }
}

/**
 * Keeps what has been typed into a Post form but not yet saved, so a reload or an
 * accidental navigation does not lose it, and warns before the page is left with such
 * changes. The copy lives in this browser tab only — it is gone when the tab closes, so
 * nothing private is left on a shared computer — and is dropped once a save succeeds.
 *
 * `slot` names the Post (or `"new"`), and `version` the stored state the copy was made
 * from: a copy of an older version is thrown away rather than laid over newer content.
 * `initial` is what the form starts from without a copy. After a mount the hook may report
 * `restored`, which the form should start from instead. Call `changeTitle`/`changeBody` on
 * every edit, `saving` when the form submits, and `saveFailed` when the action hands the
 * form back an error.
 */
export function useUnsavedPost({ slot, version, initial }: { slot: string; version: string; initial: UnsavedPost }) {
  const [restored, setRestored] = useState<UnsavedPost | null>(null)
  const current = useRef<StoredPost | null>(null)
  const savingNow = useRef(false)

  // Storage is read once, after hydration, so the server and the first client render agree.
  useEffect(() => {
    const stored = readStored(slot)
    if (!stored) return
    if (stored.version !== version) {
      removeStored(slot)
      return
    }
    current.current = stored
    setRestored({ title: stored.title, body: stored.body ? (postDocument.parse(stored.body) ?? undefined) : undefined })
  }, [slot, version])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (current.current && !savingNow.current) event.preventDefault()
    }
    window.addEventListener("beforeunload", warn)
    return () => {
      window.removeEventListener("beforeunload", warn)
      // Leaving while a save is underway means it went through: the action navigates away
      // only on success, and a failure keeps the form, and this hook, mounted.
      if (savingNow.current) removeStored(slot)
    }
  }, [slot])

  // Stable, so a form can react to its own state settling without these changing under it:
  // a submission that follows a failed one must not be marked failed too.
  const saving = useCallback(() => {
    savingNow.current = true
  }, [])
  const saveFailed = useCallback(() => {
    savingNow.current = false
  }, [])

  // The first edit copies the untouched field from `initial`, so the copy is always whole.
  const { title: initialTitle, body: initialBody } = initial
  const change = useCallback(
    (values: Partial<Pick<StoredPost, "title" | "body">>) => {
      const base = current.current ?? {
        version,
        title: initialTitle,
        body: initialBody ? JSON.stringify(initialBody) : null
      }
      current.current = { ...base, ...values }
      writeStored(slot, current.current)
    },
    [slot, version, initialTitle, initialBody]
  )

  // Stable too: the editor re-renders whenever its `onChange` changes identity.
  const changeTitle = useCallback((title: string) => change({ title }), [change])
  const changeBody = useCallback((body: RichTextDocument) => change({ body: JSON.stringify(body) }), [change])

  /** Throws the kept copy away, so the form goes back to the saved Post. */
  const discard = useCallback(() => {
    removeStored(slot)
    current.current = null
    setRestored(null)
  }, [slot])

  return { restored, changeTitle, changeBody, saving, saveFailed, discard }
}
