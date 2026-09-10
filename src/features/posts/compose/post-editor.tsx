"use client"

import { ListKeymap } from "@tiptap/extension-list"
import { Dropcursor, Gapcursor, Placeholder, UndoRedo } from "@tiptap/extensions"
import { EditorContent, useEditor } from "@tiptap/react"
import { useState } from "react"
import { cn } from "@/shared/utils"
// Straight at the implementation files, not the module's entrypoint: that also exports
// the server-side renderer, and `server-only` would follow it into this bundle.
import { postBodyExtensions } from "../markdown/extensions"
import { parsePostMarkdown, serializePostMarkdown } from "../markdown/markdown"
import { PostProse } from "../markdown/post-prose"
import { PostEditorToolbar } from "./post-editor-toolbar"

const EDITOR_ID = "post-body-editor"

/**
 * What the editor needs beyond the nodes a Post may contain. None of these add a node
 * or a mark, so the enabled set — and with it the storage format — is untouched:
 * undo, a caret that can escape a table, and a prompt on an empty document.
 */
const editingAffordances = [
  UndoRedo,
  Dropcursor,
  Gapcursor,
  ListKeymap,
  Placeholder.configure({ placeholder: "Write the post. Type ## for a heading, - for a list." })
]

/**
 * The writing surface for a Post body.
 *
 * The form around it stays an ordinary `<form>` posting FormData, so the editor's job
 * is to keep a hidden field holding the Markdown that will be stored. Nothing about
 * the server action changes because the body is rich now.
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
    // The initial document goes through the same parser the server renders from, so a
    // draft handed back after a rejected submission reopens as exactly what was typed.
    content: defaultValue ? parsePostMarkdown(defaultValue) : undefined,
    // Next renders this on the server first; rendering the editor there too would
    // hand React a tree the browser immediately disagrees with.
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

  return (
    <div className="flex flex-col">
      {editor ? <PostEditorToolbar editor={editor} /> : null}
      <PostProse
        className={cn(
          "rounded-b-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          !editor && "min-h-56 rounded-t-none px-3 py-2"
        )}
      >
        <EditorContent editor={editor} />
      </PostProse>
      {/*
        The value the server action reads. Keeping it here rather than in the form means
        a keystroke re-renders the editor, not every field around it.
      */}
      <input type="hidden" name={name} value={markdown} />
    </div>
  )
}
