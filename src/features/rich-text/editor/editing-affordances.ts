import { ListKeymap } from "@tiptap/extension-list"
import { Dropcursor, Gapcursor, UndoRedo } from "@tiptap/extensions"
import { ExitEmptyHeading } from "./exit-empty-heading"

/**
 * Editing behaviour only: none of these add a node or mark, so the stored document is
 * untouched and no consumer's schema needs to know about them.
 */
export const editingAffordances = [UndoRedo, Dropcursor, Gapcursor, ListKeymap, ExitEmptyHeading]
