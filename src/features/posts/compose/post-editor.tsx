"use client"

import { ListKeymap } from "@tiptap/extension-list"
import { Dropcursor, Gapcursor, Placeholder, UndoRedo } from "@tiptap/extensions"
import { EditorContent, useEditor } from "@tiptap/react"
import { useState } from "react"
import { cn } from "@/shared/utils"
import { postBodyExtensions } from "../markdown/extensions"
import { parsePostMarkdown, serializePostMarkdown } from "../markdown/markdown"
import { PostProse } from "../markdown/post-prose"
import { ExitEmptyHeading } from "./exit-empty-heading"
import { PostEditorToolbar } from "./post-editor-toolbar"

const EDITOR_ID = "post-body-editor"

/** Editing behaviour only: none of these add a node or mark, so the storage format is untouched. */
const editingAffordances = [
  UndoRedo,
  Dropcursor,
  Gapcursor,
  ListKeymap,
  ExitEmptyHeading,
  Placeholder.configure({ placeholder: "Write the post. Type ## for a heading, - for a list." })
]

/**
 * The writing surface for a Post body. The surrounding `<form>` still posts plain
 * FormData, so the editor keeps a hidden field holding the Markdown to store.
 */
export function PostEditor({
  name,
  defaultValue = "",
  labelledBy
}: {
  name: string
  defaultValue?: string
  /** Id of the element holding the field's visible label. */
  labelledBy: string
}) {
  const [markdown, setMarkdown] = useState(defaultValue)

  const editor = useEditor({
    extensions: [...postBodyExtensions, ...editingAffordances],
    content: defaultValue ? parsePostMarkdown(defaultValue) : undefined,
    // Rendered on the server first; an editor rendered there would mismatch on hydration.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id: EDITOR_ID,
        role: "textbox",
        "aria-labelledby": labelledBy,
        "aria-multiline": "true",
        class: "min-h-56 px-3 py-2 focus-visible:outline-none"
      }
    },
    onUpdate: ({ editor: current }) => setMarkdown(serializePostMarkdown(current.getJSON()))
  })

  // No height of its own: the field above hands down whatever the viewport has left.
  return (
    <div className="flex flex-col md:min-h-0">
      {editor ? <PostEditorToolbar editor={editor} /> : null}
      <PostProse
        className={cn(
          "rounded-b-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          // Out of room, scroll the writing rather than the page.
          "md:min-h-0 md:overflow-y-auto",
          !editor && "min-h-56 rounded-t-none px-3 py-2"
        )}
      >
        <EditorContent editor={editor} />
      </PostProse>
      {/* The value the server action reads; holding it here keeps keystrokes out of the form. */}
      <input type="hidden" name={name} value={markdown} />
    </div>
  )
}
