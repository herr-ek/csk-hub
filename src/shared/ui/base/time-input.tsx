"use client"

import { type ComponentProps, useState } from "react"
import { completeTime, maskTime, stepTime } from "@/shared/date-time"
import { Input } from "@/shared/ui/base/input"
import { cn } from "@/shared/utils"

type TimeInputProps = Omit<ComponentProps<typeof Input>, "value" | "defaultValue" | "onChange" | "type"> & {
  /** `HH:mm`, or `""` for none. */
  value: string
  onValueChange: (value: string) => void
}

/**
 * A 24-hour time box, `HH:mm`, the same in every browser. Typing `1830` gives 18:30: the colon
 * comes by itself. A complete time is reported as it is typed; a partial one is completed on
 * leaving the box (`9` → 09:00). Arrow keys move it 15 minutes. It does not submit by itself.
 */
export function TimeInput({ value, onValueChange, className, onBlur, onKeyDown, ...props }: TimeInputProps) {
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  // A new value from outside, such as an end that followed its start, replaces what is typed.
  if (value !== shown) {
    setShown(value)
    setText(value)
  }

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
      maxLength={5}
      value={text}
      className={cn("w-20 shrink-0 text-center tabular-nums", className)}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const deleting = (event.nativeEvent as InputEvent).inputType?.startsWith("delete") ?? false
        const next = maskTime(event.currentTarget.value, text, deleting)
        setText(next)
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
