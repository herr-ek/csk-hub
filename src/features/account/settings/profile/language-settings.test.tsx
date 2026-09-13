import { describe, expect, mock, test } from "bun:test"
import messages from "@messages/en.json"
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "@/core/i18n/client"

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: mock() })
}))

mock.module("./actions", () => ({
  updateLocalePreference: mock(async () => ({ success: true as const }))
}))

const { LanguageSettings } = await import("./language-settings")

describe("LanguageSettings", () => {
  test("selects the active application locale when no preference is saved", () => {
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages}>
        <LanguageSettings />
      </NextIntlClientProvider>
    )

    expect(markup).toContain('value="en"')
  })

  test("falls back to the configured default for an unsupported active locale", () => {
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="fr" messages={messages}>
        <LanguageSettings />
      </NextIntlClientProvider>
    )

    expect(markup).toContain('value="sv"')
  })
})
