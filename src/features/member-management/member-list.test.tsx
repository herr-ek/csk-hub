import { describe, expect, test } from "bun:test"
import messages from "@messages/en.json"
import { NextIntlClientProvider } from "next-intl"
import { renderToStaticMarkup } from "react-dom/server"
import { app } from "@/core/config/app"
import { MemberList } from "./member-list"

describe("MemberList", () => {
  test("formats the table caption with the application name", () => {
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MemberList members={[]} />
      </NextIntlClientProvider>
    )

    expect(markup).toContain(`Manage everyone with access to ${app.name}.`)
  })
})
