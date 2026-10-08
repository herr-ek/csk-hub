"use client"

import { useTranslations } from "@/core/i18n/translations"
import { FieldError } from "@/shared/ui/base/field"

type ValidationIssue = { message?: string; minimum?: number } | undefined

function translatedMessage(
  message: string | undefined,
  label: string,
  minimum: number | undefined,
  common: ReturnType<typeof useTranslations<"Common">>
) {
  switch (message) {
    case "validation.required":
      return common("validation.required", { label })
    case "validation.passwordTooShort":
      return common("validation.passwordTooShort", { label, count: minimum ?? 8 })
    case "validation.invalidEmail":
      return common("validation.invalidEmail", { label })
    case "validation.passwordsMismatch":
      return common("validation.passwordsMismatch")
    default:
      return message
  }
}

export function useValidationMessage() {
  const common = useTranslations("Common")
  return (message: string | undefined, label: string, minimum?: number) =>
    translatedMessage(message, label, minimum, common)
}

export function LocalizedFieldError({ errors, label }: { errors: Array<ValidationIssue>; label: string }) {
  const translate = useValidationMessage()
  return (
    <FieldError
      errors={errors.map((error) => (error ? { message: translate(error.message, label, error.minimum) } : undefined))}
    />
  )
}
