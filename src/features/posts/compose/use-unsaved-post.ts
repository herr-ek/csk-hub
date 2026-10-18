import { useCallback, useMemo, useRef } from "react"
import type { RichTextDocument } from "@/features/rich-text"
import { useUnsavedForm } from "@/shared/hooks/use-unsaved-form"
import { postDocument } from "../post-document"

/** What the form holds, as the storage keeps it: the body is the editor's document as JSON. */
type StoredPost = { title: string; body: string | null }

export type UnsavedPost = { title: string; body: RichTextDocument | undefined }

function parseStoredPost(value: unknown): StoredPost | null {
  if (typeof value !== "object" || value === null) return null
  const { title, body } = value as Partial<StoredPost>
  if (typeof title !== "string") return null
  return { title, body: typeof body === "string" ? body : null }
}

/**
 * Keeps what has been typed into a Post form but not yet saved, so a reload or an
 * accidental navigation does not lose it; see `useUnsavedForm`.
 *
 * `slot` names the Post (or `"new"`), and `version` the stored state the copy was made
 * from: a copy of an older version is thrown away rather than laid over newer content.
 * `initial` is what the form starts from without a copy. After a mount the hook may report
 * `restored`, which the form should start from instead. Call `changeTitle`/`changeBody` on
 * every edit, `saving` when the form submits, and `saveFailed` when the action hands the
 * form back an error.
 */
export function useUnsavedPost({ slot, version, initial }: { slot: string; version: string; initial: UnsavedPost }) {
  const unsaved = useUnsavedForm({ storageKey: `post.${slot}`, version, parse: parseStoredPost })
  const latest = useRef<StoredPost | null>(null)

  const restored = useMemo<UnsavedPost | null>(
    () =>
      unsaved.restored && {
        title: unsaved.restored.title,
        body: unsaved.restored.body ? (postDocument.parse(unsaved.restored.body) ?? undefined) : undefined
      },
    [unsaved.restored]
  )

  // The first edit copies the untouched field from the restored copy or `initial`, so the copy is always whole.
  const { title: initialTitle, body: initialBody } = initial
  const { keep } = unsaved
  const restoredCopy = unsaved.restored
  const change = useCallback(
    (values: Partial<StoredPost>) => {
      const base = latest.current ??
        restoredCopy ?? { title: initialTitle, body: initialBody ? JSON.stringify(initialBody) : null }
      latest.current = { ...base, ...values }
      keep(latest.current)
    },
    [keep, restoredCopy, initialTitle, initialBody]
  )

  // Stable too: the editor re-renders whenever its `onChange` changes identity.
  const changeTitle = useCallback((title: string) => change({ title }), [change])
  const changeBody = useCallback((body: RichTextDocument) => change({ body: JSON.stringify(body) }), [change])

  const { discard: discardCopy } = unsaved
  /** Throws the kept copy away, so the form goes back to the saved Post. */
  const discard = useCallback(() => {
    latest.current = null
    discardCopy()
  }, [discardCopy])

  return { restored, changeTitle, changeBody, saving: unsaved.saving, saveFailed: unsaved.saveFailed, discard }
}
