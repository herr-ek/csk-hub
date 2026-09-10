"use client"

import type { Editor } from "@tiptap/react"
import { useEditorState } from "@tiptap/react"
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  TableIcon,
  Trash2Icon,
  UnlinkIcon
} from "lucide-react"
import { type ReactNode, useState } from "react"
import { Button } from "@/shared/ui/base/button"
import { Input } from "@/shared/ui/base/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/base/popover"
import { Separator } from "@/shared/ui/base/separator"
import { Toggle } from "@/shared/ui/base/toggle"
import { safePostLinkHref } from "../markdown/markdown"

/**
 * A toolbar button that reflects and toggles a formatting state.
 *
 * `onMouseDown` is where the click is cancelled rather than `onClick`: pressing a
 * toolbar button must not take the caret out of the editor, or the command would
 * apply to nothing.
 */
function ToolbarToggle({
  label,
  pressed,
  disabled,
  onPressed,
  children
}: {
  label: string
  pressed: boolean
  disabled?: boolean
  onPressed: () => void
  children: ReactNode
}) {
  return (
    <Toggle
      type="button"
      size="sm"
      aria-label={label}
      title={label}
      pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onPressedChange={onPressed}
    >
      {children}
    </Toggle>
  )
}

function ToolbarAction({
  label,
  disabled,
  onAction,
  children
}: {
  label: string
  disabled?: boolean
  onAction: () => void
  children: ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onAction}
    >
      {children}
    </Button>
  )
}

/** The link popover, which doubles as the editor for a link that is already there. */
function LinkControl({ editor, active, href }: { editor: Editor; active: boolean; href: string }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")

  function openChange(next: boolean) {
    if (next) setValue(href)
    setOpen(next)
  }

  function apply() {
    const safe = safePostLinkHref(value)
    if (!safe) return

    editor.chain().focus().extendMarkRange("link").setLink({ href: safe }).run()
    setOpen(false)
  }

  function remove() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run()
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger
        render={
          <Toggle
            type="button"
            size="sm"
            aria-label="Link"
            title="Link"
            pressed={active}
            onMouseDown={(event) => event.preventDefault()}
          >
            <Link2Icon />
          </Toggle>
        }
      />
      <PopoverContent align="start" className="gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="post-link-href">
            Link address
          </label>
          <Input
            id="post-link-href"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              apply()
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={apply} disabled={!safePostLinkHref(value)}>
            Apply
          </Button>
          {active ? (
            <Button type="button" size="sm" variant="ghost" onClick={remove}>
              <UnlinkIcon />
              Remove
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The table controls, which only mean anything while the caret is inside a table. */
function TableControls({ editor }: { editor: Editor }) {
  return (
    <>
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolbarAction label="Add row" onAction={() => editor.chain().focus().addRowAfter().run()}>
        Row +
      </ToolbarAction>
      <ToolbarAction label="Add column" onAction={() => editor.chain().focus().addColumnAfter().run()}>
        Col +
      </ToolbarAction>
      <ToolbarAction label="Delete row" onAction={() => editor.chain().focus().deleteRow().run()}>
        Row −
      </ToolbarAction>
      <ToolbarAction label="Delete column" onAction={() => editor.chain().focus().deleteColumn().run()}>
        Col −
      </ToolbarAction>
      <ToolbarAction label="Delete table" onAction={() => editor.chain().focus().deleteTable().run()}>
        <Trash2Icon />
      </ToolbarAction>
    </>
  )
}

/**
 * Every operation the enabled node set allows, for an Admin who does not write
 * Markdown. The same operations happen by typing Markdown characters — the input
 * rules the extensions bring — so the toolbar is a second way in, not the only one.
 */
export function PostEditorToolbar({ editor }: { editor: Editor }) {
  // A toolbar reflects the caret, so it has to re-render on selection as well as on
  // content. Selecting the state keeps that to the handful of values shown.
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      heading2: current.isActive("heading", { level: 2 }),
      heading3: current.isActive("heading", { level: 3 }),
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      bulletList: current.isActive("bulletList"),
      orderedList: current.isActive("orderedList"),
      blockquote: current.isActive("blockquote"),
      link: current.isActive("link"),
      linkHref: String(current.getAttributes("link").href ?? ""),
      inTable: current.isActive("table")
    })
  })

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      aria-controls="post-body-editor"
      className="flex flex-wrap items-center gap-1 rounded-t-md border border-b-0 border-input bg-muted/40 p-1"
    >
      <ToolbarToggle
        label="Heading"
        pressed={state.heading2}
        onPressed={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2Icon />
      </ToolbarToggle>
      <ToolbarToggle
        label="Subheading"
        pressed={state.heading3}
        onPressed={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3Icon />
      </ToolbarToggle>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarToggle label="Bold" pressed={state.bold} onPressed={() => editor.chain().focus().toggleBold().run()}>
        <BoldIcon />
      </ToolbarToggle>
      <ToolbarToggle
        label="Italic"
        pressed={state.italic}
        onPressed={() => editor.chain().focus().toggleItalic().run()}
      >
        <ItalicIcon />
      </ToolbarToggle>
      <LinkControl editor={editor} active={state.link} href={state.linkHref} />

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarToggle
        label="Bullet list"
        pressed={state.bulletList}
        onPressed={() => editor.chain().focus().toggleBulletList().run()}
      >
        <ListIcon />
      </ToolbarToggle>
      <ToolbarToggle
        label="Numbered list"
        pressed={state.orderedList}
        onPressed={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrderedIcon />
      </ToolbarToggle>
      <ToolbarToggle
        label="Quote"
        pressed={state.blockquote}
        onPressed={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <QuoteIcon />
      </ToolbarToggle>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarAction
        label="Table"
        onAction={() => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}
      >
        <TableIcon />
      </ToolbarAction>
      <ToolbarAction label="Divider" onAction={() => editor.chain().focus().setHorizontalRule().run()}>
        <MinusIcon />
      </ToolbarAction>

      {state.inTable ? <TableControls editor={editor} /> : null}
    </div>
  )
}
