"use client"

import type { ComponentProps } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { InputField } from "@/shared/forms/fields"
import { validationMessageIds } from "@/shared/schemas"

type ValidationIssue = {
  message?: string
  minimum?: number | bigint
  params?: Record<string, string | number>
}

const messageIds = Object.values(validationMessageIds)

/** Translates registered validation IDs or issues; preserves other messages as plain text. */
export function useValidationMessage() {
  const common = useTranslations("Common")
  return (issue: ValidationIssue | string | undefined, label: string) => {
    const error = typeof issue === "string" ? { message: issue } : issue
    const key = messageIds.find((id) => id === error?.message)
    if (!key) return error?.message

    return common(key, {
      ...(typeof error?.minimum === "number" ? { count: error.minimum } : {}),
      ...error?.params,
      label
    })
  }
}

export function LocalizedInputField({
  errors,
  label,
  ...props
}: Omit<ComponentProps<typeof InputField>, "label" | "errors"> & {
  label: string
  errors?: Array<ValidationIssue | undefined>
}) {
  const translate = useValidationMessage()
  return (
    <InputField
      {...props}
      label={label}
      errors={errors?.map((error) => (error ? { message: translate(error, label) } : undefined))}
    />
  )
}
