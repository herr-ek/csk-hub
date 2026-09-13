import { describe, expect, test } from "bun:test"
import messages from "@messages/en.json"
import swedishMessages from "@messages/sv.json"
import { renderToStaticMarkup } from "react-dom/server"
import { app } from "@/core/config/app"
import { NextIntlClientProvider } from "@/core/i18n/client"
import { MemberList } from "./member-list"
import type { MemberListItem } from "./service"

describe("MemberList", () => {
  test("formats the table caption with the application name", () => {
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MemberList members={[]} />
      </NextIntlClientProvider>
    )

    expect(markup).toContain(`Manage everyone with access to ${app.name}.`)
  })

  test("formats joined dates with the provider locale and time zone", () => {
    const member = {
      id: "member-1",
      name: "Ada Lovelace",
      username: null,
      email: "ada@example.com",
      emailVerified: true,
      hasPassword: true,
      role: "member",
      inactive: false,
      createdAt: new Date("2026-09-08T23:30:00-02:00")
    } satisfies MemberListItem
    const markup = renderToStaticMarkup(
      <NextIntlClientProvider locale="sv" messages={swedishMessages} timeZone="UTC">
        <MemberList members={[member]} />
      </NextIntlClientProvider>
    )

    expect(markup).toContain("2026-09-09")
  })
})
