import { Extension } from "@tiptap/core"

/**
 * Enter in an empty heading turns that heading back into a paragraph. The core Enter
 * would open the next block and leave the abandoned heading behind as an empty node
 * that renders as a blank gap.
 */
export const ExitEmptyHeading = Extension.create({
  name: "exitEmptyHeading",

  // Ahead of the core keymap, whose Enter would otherwise split the block first.
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { $head, empty } = this.editor.state.selection
        const heading = $head.parent

        if (!empty || heading.type.name !== "heading" || heading.content.size > 0) {
          return false
        }

        return this.editor.commands.setParagraph()
      }
    }
  }
})
