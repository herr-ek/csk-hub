"use client"

import { Placeholder } from "@tiptap/extensions"
import { EditorContent, useEditor } from "@tiptap/react"
import { type RefObject, useId, useRef, useSyncExternalStore } from "react"
import { cn } from "@/shared/utils"
import type { DocumentSchema, RichTextDocument } from "../document"
import { RichTextProse } from "../prose"
import { editingAffordances } from "./editing-affordances"
import { RichTextToolbar } from "./rich-text-toolbar"

type EditorProps = {
  schema: DocumentSchema
  /** The form field that carries the document. */
  name: string
  defaultValue?: RichTextDocument
  /** Id of the element holding the field's visible label. */
  labelledBy: string
  placeholder: string
}

const FRAME = cn(
  "rounded-b-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]",
  "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
  // Out of room, scroll the writing rather than the page.
  "md:min-h-0 md:overflow-y-auto"
)

const subscribeToNothing = () => () => {}

/** False on the server and during hydration, true once the browser has taken over. */
function useInBrowser(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  )
}

/**
 * The writing surface for a document. The surrounding `<form>` posts plain FormData, so
 * the document travels in a hidden field as JSON, for the consumer's schema to parse back.
 *
 * Tiptap only ever renders in the browser. It draws random keys while rendering, which a
 * prerender would either freeze into the build or refuse, so the server draws an empty
 * frame instead and a consumer needs no boundary of its own around the editor.
 */
export function RichTextEditor({ name, defaultValue, ...editor }: EditorProps) {
  const inBrowser = useInBrowser()
  const field = useRef<HTMLInputElement>(null)

  // No height of its own: the field above hands down whatever the viewport has left.
  return (
    <div className="flex flex-col md:min-h-0">
      {inBrowser ? (
        <EditorSurface {...editor} defaultValue={defaultValue} field={field} />
      ) : (
        <RichTextProse className={cn(FRAME, "min-h-56 rounded-t-none px-3 py-2")} />
      )}
      {/*
        The field the form submits the document under, uncontrolled so that writing to it
        costs no render. It carries the document from the first paint, so a submission
        that beats the editor's own mount still sends what the writer started from.
      */}
      <input ref={field} type="hidden" name={name} defaultValue={defaultValue ? JSON.stringify(defaultValue) : ""} />
    </div>
  )
}

function EditorSurface({
  schema,
  defaultValue,
  labelledBy,
  placeholder,
  field
}: Omit<EditorProps, "name"> & { field: RefObject<HTMLInputElement | null> }) {
  const editorId = useId()

  const editor = useEditor({
    extensions: [...schema.extensions, ...editingAffordances, Placeholder.configure({ placeholder })],
    content: defaultValue,
    // Created in an effect rather than during render; the empty frame stands in until then.
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
    // Straight into the field the form reads, rather than through React state: the
    // document is not something this component renders, so making it state would
    // rerender the editor and its toolbar on every keystroke for nothing.
    onUpdate: ({ editor: current }) => {
      const written = field.current
      if (written) written.value = JSON.stringify(current.getJSON())
    }
  })

  return (
    <>
      {editor ? <RichTextToolbar editor={editor} schema={schema} controls={editorId} /> : null}
      <RichTextProse className={cn(FRAME, !editor && "min-h-56 rounded-t-none px-3 py-2")}>
        <EditorContent editor={editor} />
      </RichTextProse>
    </>
  )
}
