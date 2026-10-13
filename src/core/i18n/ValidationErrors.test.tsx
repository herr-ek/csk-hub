import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { z } from "zod"
import { normalizedEmailSchema, passwordSchema, validationMessageIds } from "@/shared/schemas"
import { NextIntlClientProvider } from "./client"
import type { Locale } from "./locales"
import { getMessages } from "./messages"
import { useValidationMessage } from "./validation-errors"

type ValidationInput = Parameters<ReturnType<typeof useValidationMessage>>[0]

function ValidationText({ issue, label }: { issue: ValidationInput; label: string }) {
  const translate = useValidationMessage()
  return translate(issue, label)
}

function renderMessage(issue: ValidationInput, label: string, locale: Locale = "en", onError?: (error: Error) => void) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Europe/Oslo" onError={onError}>
      <ValidationText issue={issue} label={label} />
    </NextIntlClientProvider>
  )
}

describe("validation messages", () => {
  test("translates schema errors and adds the field label", () => {
    const required = passwordSchema.safeParse("").error?.issues[0]
    const invalidEmail = normalizedEmailSchema.safeParse("invalid").error?.issues[0]

    expect(renderMessage(required, "Password")).toBe("Password is required.")
    expect(renderMessage(invalidEmail, "Email")).toBe("Email must be a valid email address.")
    expect(renderMessage(validationMessageIds.passwordsMismatch, "Password")).toBe("Passwords do not match.")
  })

  test("uses the schema's actual minimum in every locale", () => {
    const schema = z.string().min(13, { message: validationMessageIds.passwordTooShort })
    const issue = schema.safeParse("short").error?.issues[0]

    expect(renderMessage(issue, "Password", "en")).toBe("Password must be at least 13 characters.")
    expect(renderMessage(issue, "Lösenord", "sv")).toBe("Lösenord måste innehålla minst 13 tecken.")
    expect(renderMessage(issue, "Passwort", "de")).toBe("Passwort muss mindestens 13 Zeichen enthalten.")
  })

  test("passes custom refinement params without message-specific translation logic", () => {
    const schema = z.string().refine((value) => value.length >= 21, {
      message: validationMessageIds.passwordTooShort,
      params: { count: 21 }
    })
    const issue = schema.safeParse("short").error?.issues[0]

    expect(renderMessage(issue, "Passphrase")).toBe("Passphrase must be at least 21 characters.")
  })

  test("keeps the field label supplied by the UI", () => {
    expect(renderMessage({ message: validationMessageIds.required, params: { label: "Other field" } }, "Email")).toBe(
      "Email is required."
    )
  })

  test("preserves plain messages and absent errors", () => {
    expect(renderMessage("Email already exists.", "Email")).toBe("Email already exists.")
    expect(renderMessage({ message: "Unknown validation error." }, "Email")).toBe("Unknown validation error.")
    expect(renderMessage(undefined, "Email")).toBe("")
  })

  test("does not invent a minimum when validation supplied none", () => {
    const errors: Error[] = []
    renderMessage({ message: validationMessageIds.passwordTooShort }, "Password", "en", (error) => errors.push(error))

    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toContain("count")
  })
})
