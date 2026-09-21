"use client"

import type { Editor } from "@tiptap/react"
import { useEditorState } from "@tiptap/react"
import {
  BoldIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  Heading5Icon,
  Heading6Icon,
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
import { type ReactNode, useId, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { Input } from "@/shared/ui/base/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/base/popover"
import { Separator } from "@/shared/ui/base/separator"
import { Toggle } from "@/shared/ui/base/toggle"
import { type DocumentSchema, safeLinkHref } from "../document"

const headingIcons = [Heading1Icon, Heading2Icon, Heading3Icon, Heading4Icon, Heading5Icon, Heading6Icon]

/**
 * A toolbar button that reflects and toggles a formatting state. The click is cancelled
 * on `onMouseDown` so pressing it leaves the caret in the editor.
 */
function ToolbarToggle({
  label,
  pressed,
  onPressed,
  children
}: {
  label: string
  pressed: boolean
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
      onMouseDown={(event) => event.preventDefault()}
      onPressedChange={onPressed}
    >
      {children}
    </Toggle>
  )
}

function ToolbarAction({ label, onAction, children }: { label: string; onAction: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onAction}
    >
      {children}
    </Button>
  )
}

/** A run of related controls; the separator in front of the first group stays hidden. */
function ToolbarGroup({ children }: { children: ReactNode }) {
  return (
    <>
      <Separator orientation="vertical" className="mx-1 h-6 first:hidden" />
      {children}
    </>
  )
}

/** The link popover, which also edits a link that is already there. */
function LinkControl({ editor, active, href }: { editor: Editor; active: boolean; href: string }) {
  const t = useTranslations("RichText.editor")
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")

  function openChange(next: boolean) {
    if (next) setValue(href)
    setOpen(next)
  }

  function apply() {
    const safe = safeLinkHref(value)
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
            aria-label={t("link")}
            title={t("link")}
            pressed={active}
            onMouseDown={(event) => event.preventDefault()}
          >
            <Link2Icon />
          </Toggle>
        }
      />
      <PopoverContent align="start" className="gap-3">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor={inputId}>
            {t("linkAddress")}
          </label>
          <Input
            id={inputId}
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
          <Button type="button" size="sm" onClick={apply} disabled={!safeLinkHref(value)}>
            {t("apply")}
          </Button>
          {active ? (
            <Button type="button" size="sm" variant="ghost" onClick={remove}>
              <UnlinkIcon />
              {t("removeLink")}
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Table controls, shown only while the caret is inside a table. */
function TableControls({ editor }: { editor: Editor }) {
  const t = useTranslations("RichText.editor")

  return (
    <ToolbarGroup>
      <ToolbarAction label={t("addRow")} onAction={() => editor.chain().focus().addRowAfter().run()}>
        {t("addRowShort")}
      </ToolbarAction>
      <ToolbarAction label={t("addColumn")} onAction={() => editor.chain().focus().addColumnAfter().run()}>
        {t("addColumnShort")}
      </ToolbarAction>
      <ToolbarAction label={t("deleteRow")} onAction={() => editor.chain().focus().deleteRow().run()}>
        {t("deleteRowShort")}
      </ToolbarAction>
      <ToolbarAction label={t("deleteColumn")} onAction={() => editor.chain().focus().deleteColumn().run()}>
        {t("deleteColumnShort")}
      </ToolbarAction>
      <ToolbarAction label={t("deleteTable")} onAction={() => editor.chain().focus().deleteTable().run()}>
        <Trash2Icon />
      </ToolbarAction>
    </ToolbarGroup>
  )
}

/**
 * A control for every operation the schema allows, for a writer who does not type
 * Markdown. A feature the schema leaves out has no control, so a smaller document gets
 * a smaller toolbar without anyone configuring one.
 */
export function RichTextToolbar({
  editor,
  schema,
  controls
}: {
  editor: Editor
  schema: DocumentSchema
  /** Id of the editor element the toolbar acts on. */
  controls: string
}) {
  const t = useTranslations("RichText.editor")
  const { nodes, marks } = editor.schema
  // The toolbar re-renders on every selection change; the selector keeps that to what it shows.
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      headingLevel: Number(current.getAttributes("heading").level ?? 0),
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
      aria-label={t("formatting")}
      aria-controls={controls}
      className="flex shrink-0 flex-wrap items-center gap-1 rounded-t-md border border-b-0 border-input bg-muted/40 p-1"
    >
      {schema.headingLevels.length > 0 ? (
        <ToolbarGroup>
          {schema.headingLevels.map((level) => {
            const Icon = headingIcons[level - 1] ?? Heading1Icon
            return (
              <ToolbarToggle
                key={level}
                label={t("heading", { level })}
                pressed={state.headingLevel === level}
                onPressed={() => editor.chain().focus().toggleHeading({ level }).run()}
              >
                <Icon />
              </ToolbarToggle>
            )
          })}
        </ToolbarGroup>
      ) : null}

      {marks.bold || marks.italic || marks.link ? (
        <ToolbarGroup>
          {marks.bold ? (
            <ToolbarToggle
              label={t("bold")}
              pressed={state.bold}
              onPressed={() => editor.chain().focus().toggleBold().run()}
            >
              <BoldIcon />
            </ToolbarToggle>
          ) : null}
          {marks.italic ? (
            <ToolbarToggle
              label={t("italic")}
              pressed={state.italic}
              onPressed={() => editor.chain().focus().toggleItalic().run()}
            >
              <ItalicIcon />
            </ToolbarToggle>
          ) : null}
          {marks.link ? <LinkControl editor={editor} active={state.link} href={state.linkHref} /> : null}
        </ToolbarGroup>
      ) : null}

      {nodes.bulletList || nodes.orderedList || nodes.blockquote ? (
        <ToolbarGroup>
          {nodes.bulletList ? (
            <ToolbarToggle
              label={t("bulletList")}
              pressed={state.bulletList}
              onPressed={() => editor.chain().focus().toggleBulletList().run()}
            >
              <ListIcon />
            </ToolbarToggle>
          ) : null}
          {nodes.orderedList ? (
            <ToolbarToggle
              label={t("orderedList")}
              pressed={state.orderedList}
              onPressed={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrderedIcon />
            </ToolbarToggle>
          ) : null}
          {nodes.blockquote ? (
            <ToolbarToggle
              label={t("quote")}
              pressed={state.blockquote}
              onPressed={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <QuoteIcon />
            </ToolbarToggle>
          ) : null}
        </ToolbarGroup>
      ) : null}

      {nodes.table || nodes.horizontalRule ? (
        <ToolbarGroup>
          {nodes.table ? (
            <ToolbarAction
              label={t("table")}
              onAction={() => editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}
            >
              <TableIcon />
            </ToolbarAction>
          ) : null}
          {nodes.horizontalRule ? (
            <ToolbarAction label={t("divider")} onAction={() => editor.chain().focus().setHorizontalRule().run()}>
              <MinusIcon />
            </ToolbarAction>
          ) : null}
        </ToolbarGroup>
      ) : null}

      {state.inTable ? <TableControls editor={editor} /> : null}
    </div>
  )
}
