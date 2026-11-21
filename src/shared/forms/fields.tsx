"use client"

import { type ComponentProps, type ReactNode, useId, useState } from "react"
import { joinDateTime, splitDateTime } from "@/shared/date-time"
import { DatePicker } from "@/shared/ui/base/date-picker"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"
import { TimeInput } from "@/shared/ui/base/time-input"
import { useUiLabels } from "@/shared/ui/UiLabelsProvider"
import { useValidationFormatter, type ValidationIssue } from "./validation-messages"

/** The label, help text and errors around a control; the control's own props go to the control. */
type FieldChrome = {
  label: ReactNode
  description?: ReactNode
  /** Marks the field and its control invalid, for styling and assistive technology. */
  invalid?: boolean
  /** An error message, or a validator's error list, shown below the control. */
  error?: ReactNode
  errors?: Array<ValidationIssue | undefined>
}

/**
 * A key for an uncontrolled control, from its default. A new default, as after a Server Action
 * revalidates the page while a dialog closes, starts a fresh control instead of changing the
 * default of an initialised one, which Base UI warns about.
 */
function defaultKey(defaultValue: unknown) {
  return defaultValue === undefined ? undefined : String(defaultValue)
}

function FieldMessages({ description, error, errors }: Omit<FieldChrome, "label" | "invalid">) {
  const format = useValidationFormatter()
  const localizedErrors = error
    ? undefined
    : errors?.map((issue) => {
        if (!issue?.message) return undefined
        return { message: format(issue) }
      })

  return (
    <>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={localizedErrors}>{error}</FieldError>
    </>
  )
}

/**
 * A labelled `Input`. Every `Input` prop passes through, covering text, email, password, date and file.
 * Validator `errors` are formatted independently of the label and require a formatter supplied through ValidationMessagesContext.
 * Use `error` for already-formatted content, which takes precedence over validator issues.
 */
export function InputField({
  label,
  description,
  invalid,
  error,
  errors,
  id,
  ...inputProps
}: FieldChrome & ComponentProps<typeof Input>) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Input key={defaultKey(inputProps.defaultValue)} id={inputId} aria-invalid={invalid} {...inputProps} />
      <FieldMessages description={description} error={error} errors={errors} />
    </Field>
  )
}

/**
 * A labelled `Select` that submits `name` with its form. Uncontrolled, it starts on the first
 * option; given `value`, it is controlled and reports changes through `onValueChange`.
 * Validator `errors` are formatted independently of the label and require a formatter supplied through ValidationMessagesContext.
 * Use `error` for already-formatted content, which takes precedence over validator issues.
 */
export function SelectField({
  label,
  description,
  invalid,
  error,
  errors,
  name,
  options,
  defaultValue,
  value,
  onValueChange,
  required
}: FieldChrome & {
  name: string
  options: { value: string; label: string }[]
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  required?: boolean
}) {
  const id = useId()
  const initial = defaultValue ?? options[0]?.value
  const controlled = value === undefined ? { defaultValue: initial } : { value }
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        key={value === undefined ? defaultKey(initial) : undefined}
        name={name}
        items={options}
        {...controlled}
        onValueChange={(next) => onValueChange?.(next ?? "")}
        required={required}
      >
        <SelectTrigger id={id} aria-invalid={invalid} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldMessages description={description} error={error} errors={errors} />
    </Field>
  )
}

/**
 * Puts a picker's value into the form under `name`, and holds the browser's required check,
 * which a button cannot. Kept out of sight and out of the tab order; the picker is the control.
 */
function FormValue({ name, value, required }: { name: string; value: string; required?: boolean }) {
  return (
    <input
      name={name}
      value={value}
      required={required}
      onChange={() => {}}
      tabIndex={-1}
      aria-hidden="true"
      className="sr-only"
    />
  )
}

type PickerFieldProps = FieldChrome & {
  name: string
  defaultValue?: string
  /** Controls the field; report changes through `onValueChange`. Omit it for an uncontrolled field. */
  value?: string
  onValueChange?: (value: string) => void
  /** Without it the field can be cleared. */
  required?: boolean
  /** The first day the calendar lets you pick, `YYYY-MM-DD` or a date-time. */
  min?: string
  /** The month the calendar opens on while empty, `YYYY-MM-DD` or a date-time. */
  defaultMonth?: string
}

/**
 * A labelled date picker that submits `name` as `YYYY-MM-DD`, or empty. Use it instead of
 * `InputField` with `type="date"`, whose look and format depend on the browser.
 */
export function DateField({
  label,
  description,
  invalid,
  error,
  errors,
  name,
  defaultValue = "",
  value,
  onValueChange,
  required,
  min,
  defaultMonth
}: PickerFieldProps) {
  const id = useId()
  const [own, setOwn] = useState(defaultValue)
  const current = value ?? own
  const change = (next: string) => {
    setOwn(next)
    onValueChange?.(next)
  }

  return (
    <Field data-invalid={invalid}>
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {label}
      </FieldLabel>
      <DatePicker
        id={id}
        aria-labelledby={`${id}-label`}
        value={current}
        onValueChange={change}
        invalid={invalid}
        clearable={!required}
        min={min?.slice(0, 10)}
        defaultMonth={defaultMonth?.slice(0, 10)}
      />
      <FormValue name={name} value={current} required={required} />
      <FieldMessages description={description} error={error} errors={errors} />
    </Field>
  )
}

/**
 * A labelled date picker and 24-hour time box that submit `name` as `YYYY-MM-DDTHH:mm`, or empty
 * until both are filled in. Use it instead of `InputField` with `type="datetime-local"`. A
 * controlled field reports a value only once it is complete, or `""` when it is cleared.
 */
export function DateTimeField({
  label,
  description,
  invalid,
  error,
  errors,
  name,
  defaultValue = "",
  value,
  onValueChange,
  required,
  min,
  defaultMonth
}: PickerFieldProps) {
  const id = useId()
  const labels = useUiLabels()
  const [parts, setParts] = useState(() => splitDateTime(value ?? defaultValue))
  const [shown, setShown] = useState(value)
  // A new value from outside replaces what is picked, unless it is what is picked already.
  if (value !== shown) {
    setShown(value)
    if (value !== undefined && value !== joinDateTime(parts)) setParts(splitDateTime(value))
  }
  const current = joinDateTime(parts)
  const change = (next: { date: string; time: string }) => {
    setParts(next)
    const joined = joinDateTime(next)
    if (joined !== current) onValueChange?.(joined)
  }

  return (
    <Field data-invalid={invalid}>
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {label}
      </FieldLabel>
      <div className="flex gap-2">
        <DatePicker
          id={id}
          aria-labelledby={`${id}-label`}
          className="flex-1"
          value={parts.date}
          onValueChange={(date) => change(date ? { ...parts, date } : { date: "", time: "" })}
          invalid={invalid}
          clearable={!required}
          min={min?.slice(0, 10)}
          defaultMonth={defaultMonth?.slice(0, 10)}
        />
        <span id={`${id}-time`} className="sr-only">
          {labels.time}
        </span>
        <TimeInput
          aria-labelledby={`${id}-label ${id}-time`}
          aria-invalid={invalid}
          value={parts.time}
          onValueChange={(time) => change({ ...parts, time })}
        />
      </div>
      <FormValue name={name} value={current} required={required} />
      <FieldMessages description={description} error={error} errors={errors} />
    </Field>
  )
}
