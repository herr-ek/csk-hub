"use client"

import { type ComponentProps, type ReactNode, useId } from "react"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"
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
 * A labelled, uncontrolled `Select` that submits `name` with its form. It starts on the first option.
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
  required
}: FieldChrome & {
  name: string
  options: { value: string; label: string }[]
  defaultValue?: string
  required?: boolean
}) {
  const id = useId()
  const initial = defaultValue ?? options[0]?.value
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select key={defaultKey(initial)} name={name} items={options} defaultValue={initial} required={required}>
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
