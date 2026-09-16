import { GlobalRegistrator } from "@happy-dom/global-registrator"

// ProseMirror needs a DOM, registered before the editor modules below evaluate.
GlobalRegistrator.register({ url: "http://localhost:3000" })

import { describe, expect, test } from "bun:test"
import { Editor } from "@tiptap/core"
import { ListKeymap } from "@tiptap/extension-list"
import { Dropcursor, Gapcursor, Placeholder, UndoRedo } from "@tiptap/extensions"
import { postBodyExtensions } from "../markdown/extensions"
import { serializePostMarkdown } from "../markdown/markdown"
import { ExitEmptyHeading } from "./exit-empty-heading"

/** The editor the Admin types into, kept in step with `PostEditor` by hand. */
function editorWith(content: string): Editor {
  const element = document.createElement("div")
  document.body.appendChild(element)

  return new Editor({
    element,
    content,
    extensions: [
      ...postBodyExtensions,
      UndoRedo,
      Dropcursor,
      Gapcursor,
      ListKeymap,
      ExitEmptyHeading,
      Placeholder.configure({ placeholder: "Write the post." })
    ]
  })
}

/** Enter as ProseMirror sees it — the same path a real keystroke takes. */
function pressEnter(editor: Editor): void {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })

  editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event as never))
}

/** The block types the document is made of. */
function blocks(editor: Editor): string[] {
  return (editor.getJSON().content ?? []).map((node) =>
    node.type === "heading" ? `h${node.attrs?.level}` : String(node.type)
  )
}

describe("Enter in the Post editor", () => {
  test("leaves a heading for ordinary text", () => {
    const editor = editorWith("<h2>Rehearsals</h2>")

    editor.commands.focus("end")
    pressEnter(editor)
    editor.commands.insertContent("Bring the folder.")

    expect(blocks(editor)).toEqual(["h2", "paragraph"])
    expect(serializePostMarkdown(editor.getJSON())).toBe("## Rehearsals\n\nBring the folder.")
  })

  test("leaves a subheading for ordinary text", () => {
    const editor = editorWith("<h3>Tenors</h3>")

    editor.commands.focus("end")
    pressEnter(editor)
    editor.commands.insertContent("Meet at seven.")

    expect(blocks(editor)).toEqual(["h3", "paragraph"])
  })

  test("reverts an emptied heading instead of leaving it behind", () => {
    const editor = editorWith("<h2></h2>")

    editor.commands.focus("end")
    pressEnter(editor)
    editor.commands.insertContent("Bring the folder.")

    expect(blocks(editor)).toEqual(["paragraph"])
    expect(serializePostMarkdown(editor.getJSON())).toBe("Bring the folder.")
  })

  test("still splits a heading that has words in it", () => {
    const editor = editorWith("<h2>Rehearsals and gigs</h2>")

    editor.commands.setTextSelection(12)
    pressEnter(editor)

    expect(blocks(editor)).toEqual(["h2", "h2"])
  })

  test("keeps paragraphs splitting into paragraphs", () => {
    const editor = editorWith("<p>Bring the folder.</p>")

    editor.commands.focus("end")
    pressEnter(editor)
    editor.commands.insertContent("And the score.")

    expect(blocks(editor)).toEqual(["paragraph", "paragraph"])
  })
})
