import { describe, expect, test } from "bun:test"
import type { ComponentProps } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { z } from "zod"
import { InputField } from "@/shared/forms/fields"
import { normalizedEmailSchema, passwordSchema, validationMessageIds } from "@/shared/schemas"
import { NextIntlClientProvider } from "./client"
import { LocalizedFormProvider } from "./LocalizedFormProvider"
import type { Locale } from "./locales"
import { getMessages } from "./messages"
import { useValidationMessage } from "./validation-errors"

type ValidationInput = Parameters<ReturnType<typeof useValidationMessage>>[0]

function ValidationText({ issue }: { issue: ValidationInput }) {
  const translate = useValidationMessage()
  return translate(issue)
}

function renderMessage(issue: ValidationInput, locale: Locale = "en", onError?: (error: Error) => void) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Europe/Oslo" onError={onError}>
      <ValidationText issue={issue} />
    </NextIntlClientProvider>
  )
}

function renderField(props: ComponentProps<typeof InputField>, locale: Locale = "en") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={getMessages(locale)} timeZone="Europe/Oslo">
      <LocalizedFormProvider>
        <InputField {...props} />
      </LocalizedFormProvider>
    </NextIntlClientProvider>
  )
}

describe("validation messages", () => {
  test("translates schema errors without a field label in every locale", () => {
    const required = passwordSchema.safeParse("").error?.issues[0]
    const invalidEmail = normalizedEmailSchema.safeParse("invalid").error?.issues[0]
    const cases = [
      { locale: "en", required: "This field is required.", invalidEmail: "Enter a valid email address." },
      { locale: "sv", required: "Det här fältet måste fyllas i.", invalidEmail: "Ange en giltig e-postadress." },
      { locale: "de", required: "Dieses Feld ist erforderlich.", invalidEmail: "Gib eine gültige E-Mail-Adresse ein." }
    ] as const

    for (const { locale, ...messages } of cases) {
      expect(renderMessage(required, locale)).toBe(messages.required)
      expect(renderMessage(invalidEmail, locale)).toBe(messages.invalidEmail)
    }
    expect(renderMessage(validationMessageIds.passwordsMismatch)).toBe("Passwords do not match.")
  })

  test("uses the schema's actual minimum in every locale", () => {
    const schema = z.string().min(13, { message: validationMessageIds.passwordTooShort })
    const issue = schema.safeParse("short").error?.issues[0]

    expect(renderMessage(issue, "en")).toBe("Use at least 13 characters.")
    expect(renderMessage(issue, "sv")).toBe("Använd minst 13 tecken.")
    expect(renderMessage(issue, "de")).toBe("Verwende mindestens 13 Zeichen.")
  })

  test("passes custom refinement params without message-specific translation logic", () => {
    const schema = z.string().refine((value) => value.length >= 21, {
      message: validationMessageIds.passwordTooShort,
      params: { count: 21 }
    })
    const issue = schema.safeParse("short").error?.issues[0]

    expect(renderMessage(issue)).toBe("Use at least 21 characters.")
  })

  test("preserves plain messages and absent errors", () => {
    expect(renderMessage("Email already exists.")).toBe("Email already exists.")
    expect(renderMessage({ message: "Unknown validation error." })).toBe("Unknown validation error.")
    expect(renderMessage(undefined)).toBe("")
  })

  test("does not invent a minimum when validation supplied none", () => {
    const errors: Error[] = []
    renderMessage({ message: validationMessageIds.passwordTooShort }, "en", (error) => errors.push(error))

    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toContain("count")
  })
})

describe("shared field validation", () => {
  test("InputField translates schema issues with their actual minimum in every locale", () => {
    const schema = z.string().min(13, { message: validationMessageIds.passwordTooShort })
    const issues = schema.safeParse("short").error?.issues
    const cases = [
      { locale: "en", label: "Password", message: "Use at least 13 characters." },
      { locale: "sv", label: "Lösenord", message: "Använd minst 13 tecken." },
      { locale: "de", label: "Passwort", message: "Verwende mindestens 13 Zeichen." }
    ] as const

    for (const { locale, label, message } of cases) {
      const html = renderField({ label, errors: issues, invalid: true }, locale)
      expect(html).toContain(message)
      expect(html).not.toContain(validationMessageIds.passwordTooShort)
    }
  })

  test("preserves custom refinement parameters through InputField", () => {
    const schema = z.string().refine((value) => value.length >= 21, {
      message: validationMessageIds.passwordTooShort,
      params: { count: 21 }
    })
    const issues = schema.safeParse("short").error?.issues

    expect(renderField({ label: "Passphrase", errors: issues })).toContain("Use at least 21 characters.")
  })

  test("supports rich field labels without passing them into validation messages", () => {
    const required = normalizedEmailSchema.safeParse("").error?.issues
    const invalidEmail = normalizedEmailSchema.safeParse("invalid").error?.issues
    const label = "Email"
    const richLabel = <strong>{label}</strong>
    const html = renderField({ label: richLabel, errors: required })

    expect(html).toContain(`<strong>${label}</strong>`)
    expect(html).toContain("This field is required.")
    expect(renderField({ label: richLabel, errors: invalidEmail })).toContain("Enter a valid email address.")
  })

  test("preserves plain messages and lets explicit error content override issues", () => {
    const message = "Email already exists."
    expect(renderField({ label: "Email", errors: [undefined, { message }] })).toContain(message)

    const html = renderField({ label: "Email", error: message, errors: [{ message: validationMessageIds.required }] })
    expect(html).toContain(message)
    expect(html).not.toContain("This field is required.")
  })

  test("fields without validator errors can render without a provider", () => {
    const label = "Email"
    const message = "Email already exists."

    expect(renderToStaticMarkup(<InputField label={label} />)).toContain(label)
    expect(renderToStaticMarkup(<InputField label={label} errors={[]} />)).not.toContain('role="alert"')
    expect(renderToStaticMarkup(<InputField label={label} error={message} />)).toContain(message)
  })

  test("requires a provider for validator errors", () => {
    const label = "Email"
    const issues = normalizedEmailSchema.safeParse("").error?.issues

    expect(() => renderToStaticMarkup(<InputField label={label} errors={issues} />)).toThrow(
      "Validation errors require a formatter provider."
    )
  })
})
