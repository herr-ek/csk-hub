"use client"

import { type ReactNode, useId } from "react"
import { Field, FieldDescription, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/base/select"

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
      <Select
        name={name}
        items={options}
        defaultValue={defaultValue ?? options[0]?.value}
        required={required}
        onValueChange={(value) => onChange?.(value ?? "")}
      >
        <SelectTrigger id={id} className="w-full">
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
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  )
}
