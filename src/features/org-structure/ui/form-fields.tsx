"use client"

import { type ReactNode, useId } from "react"
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { NativeSelect, NativeSelectOption } from "@/shared/ui/base/native-select"

export function TextField({ label, name, defaultValue }: { label: string; name: string; defaultValue?: string }) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} defaultValue={defaultValue} required maxLength={120} />
    </Field>
  )
}

export function DateField({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} type="date" defaultValue={defaultValue} required />
    </Field>
  )
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
  description,
  required = true,
  onChange
}: {
  label: string
  name: string
  options: { value: string; label: string }[]
  defaultValue?: string
  description?: ReactNode
  required?: boolean
  onChange?: (value: string) => void
}) {
  const id = useId()
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <NativeSelect
        id={id}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full"
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  )
}
