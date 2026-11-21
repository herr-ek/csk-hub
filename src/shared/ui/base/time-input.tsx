"use client"

import { type ComponentProps, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react"
import { completeTime, maskTime, overwriteTime, stepTime } from "@/shared/date-time"
import { Input } from "@/shared/ui/base/input"
import { cn } from "@/shared/utils"

type TimeInputProps = Omit<ComponentProps<typeof Input>, "value" | "defaultValue" | "onChange" | "type" | "ref"> & {
  /** `HH:mm`, or `""` for none. */
  value: string
  onValueChange: (value: string) => void
}

/**
 * A 24-hour time box, `HH:mm`, the same in every browser. Typing `1830` gives 18:30: the colon
 * comes by itself. Typing with the caret inside the time overwrites the digit there. A complete
 * time is reported as it is typed; a partial one is completed on leaving the box (`9` → 09:00). Arrow keys move it 15 minutes. It does not submit by itself.
 */
export function TimeInput({ value, onValueChange, className, onBlur, onKeyDown, ...props }: TimeInputProps) {
  const input = useRef<HTMLInputElement>(null)
  // The caret travels with the text: a rewritten value would otherwise put it at the end.
  const [edit, setEdit] = useState<{ text: string; caret: number | null }>({ text: value, caret: null })
  const text = edit.text
  const setText = (next: string, caret: number | null = null) => setEdit({ text: next, caret })
  const [shown, setShown] = useState(value)
  // A new value from outside, such as an end that followed its start, replaces what is typed.
  // The one just typed comes back too; it must keep its caret.
  if (value !== shown) {
    setShown(value)
    if (value !== text) setText(value)
  }

  useLayoutEffect(() => {
    if (edit.caret !== null && document.activeElement === input.current) {
      input.current?.setSelectionRange(edit.caret, edit.caret)
    }
  }, [edit])

  const overwrite = useEffectEvent((caret: number, digit: string) => {
    const overwritten = overwriteTime(text, caret, digit)
    if (!overwritten) return
    setText(overwritten.text, overwritten.caret)
    if (overwritten.text.length === 5 && overwritten.text !== value) onValueChange(overwritten.text)
  })

  // Typing inside the time overwrites instead of inserting. The insert is cancelled before the
  // browser makes it, so React never has to put back a rejected value, which moves the caret.
  useEffect(() => {
    const element = input.current
    if (!element) return
    const beforeInput = (event: InputEvent) => {
      const caret = element.selectionStart ?? element.value.length
      if (event.inputType !== "insertText" || !event.data || caret !== element.selectionEnd) return
      if (caret >= element.value.length) return
      event.preventDefault()
      overwrite(caret, event.data)
    }
    element.addEventListener("beforeinput", beforeInput)
    return () => element.removeEventListener("beforeinput", beforeInput)
  }, [])

  const commit = () => {
    const time = completeTime(text)
    if (time === null) return setText(value)
    setText(time)
    if (time !== value) onValueChange(time)
  }

  return (
    <Input
      {...props}
      inputMode="numeric"
      autoComplete="off"
      placeholder="--:--"
      ref={input}
      value={text}
      className={cn("w-20 shrink-0 text-center tabular-nums", className)}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const { value: raw, selectionStart } = event.currentTarget
        const { inputType, data } = event.nativeEvent as InputEvent
        const caret = selectionStart ?? raw.length
        // Where `beforeinput` cannot be cancelled, an insert inside the text is overwritten here.
        if (inputType === "insertText" && data && raw.length === text.length + 1 && caret <= text.length) {
          const overwritten = overwriteTime(text, caret - 1, data)
          setText(overwritten?.text ?? text, overwritten?.caret ?? caret - 1)
          if (overwritten?.text.length === 5 && overwritten.text !== value) onValueChange(overwritten.text)
          return
        }
        const deleting = inputType?.startsWith("delete") ?? false
        const next = maskTime(raw, text, deleting)
        setText(next, deleting ? Math.min(caret, next.length) : null)
        if (next === "" ? value !== "" : next.length === 5 && next !== value) onValueChange(next)
      }}
      onBlur={(event) => {
        commit()
        onBlur?.(event)
      }}
      onKeyDown={(event) => {
        // Before the form's implicit submit, so a partly typed time is sent complete.
        if (event.key === "Enter") commit()
        if ((event.key === "ArrowUp" || event.key === "ArrowDown") && value) {
          event.preventDefault()
          onValueChange(stepTime(value, event.key === "ArrowUp" ? 15 : -15))
        }
        onKeyDown?.(event)
      }}
    />
  )
}
