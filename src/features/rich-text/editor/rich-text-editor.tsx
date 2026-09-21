"use client"

import { Placeholder } from "@tiptap/extensions"
import { EditorContent, useEditor } from "@tiptap/react"
import { useId, useState } from "react"
import { cn } from "@/shared/utils"
import type { DocumentSchema, RichTextDocument } from "../document"
// Deep import on purpose: the view's entrypoint reaches the server-only renderer, and
// this is a Client Component.
import { RichTextProse } from "../view/rich-text-prose"
import { editingAffordances } from "./editing-affordances"
import { RichTextToolbar } from "./rich-text-toolbar"

/**
 * The writing surface for a document. The surrounding `<form>` posts plain FormData, so
 * the document travels in a hidden field as JSON, for the consumer's schema to parse back.
 */
export function RichTextEditor({
  schema,
  name,
  defaultValue,
  labelledBy,
  placeholder
}: {
  schema: DocumentSchema
  /** The form field that carries the document. */
  name: string
  defaultValue?: RichTextDocument
  /** Id of the element holding the field's visible label. */
  labelledBy: string
  placeholder: string
}) {
  const editorId = useId()
  const [document, setDocument] = useState(() => (defaultValue ? JSON.stringify(defaultValue) : ""))

  const editor = useEditor({
    extensions: [...schema.extensions, ...editingAffordances, Placeholder.configure({ placeholder })],
    content: defaultValue,
    // Rendered on the server first; an editor rendered there would mismatch on hydration.
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id: editorId,
        role: "textbox",
        "aria-labelledby": labelledBy,
        "aria-multiline": "true",
        class: "min-h-56 px-3 py-2 focus-visible:outline-none"
      }
    },
    onUpdate: ({ editor: current }) => setDocument(JSON.stringify(current.getJSON()))
  })

  // No height of its own: the field above hands down whatever the viewport has left.
  return (
    <div className="flex flex-col md:min-h-0">
      {editor ? <RichTextToolbar editor={editor} schema={schema} controls={editorId} /> : null}
      <RichTextProse
        className={cn(
          "rounded-b-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
          // Out of room, scroll the writing rather than the page.
          "md:min-h-0 md:overflow-y-auto",
          !editor && "min-h-56 rounded-t-none px-3 py-2"
        )}
      >
        <EditorContent editor={editor} />
      </RichTextProse>
      {/* The value the form submits; holding it here keeps keystrokes out of the form. */}
      <input type="hidden" name={name} value={document} />
    </div>
  )
}
