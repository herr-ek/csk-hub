# Internationalization

This module owns CSK Hub's locale contract: supported locales, cookie behavior, next-intl routing, request configuration, and catalog loading. Read this file before adding user-facing copy.

## Translation interface

Only this module imports `next-intl`. Async Server Components, pages, layouts, and metadata use `getTranslations` from `@/core/i18n/server`; components that use the `useTranslations` hook import it from `@/core/i18n/translations`; Client Components use browser-only locale helpers from `@/core/i18n/client`. The proxy delegates locale routing to `middleware.ts`.

Keep server and client imports separate. `translations.ts` is intentionally universal because next-intl supports `useTranslations` in synchronous Server Components. Do not add a broad barrel that combines the server-only and client-only modules.

Keep shared UI base components independent of this module. Their localized-copy props should be optional and default to English; app code can use a wrapper when it needs locale-aware copy, but direct use must remain valid. For example, [`localized-controls.tsx`](./localized-controls.tsx) wraps the dialog primitives used by app workflows, and [`validation-errors.tsx`](./validation-errors.tsx) translates stable validation issue IDs for display.

`next-intl.d.ts` registers the English catalogue as the canonical message shape. Translation namespaces and keys used through the façade are checked by TypeScript; catalogue parity remains responsible for checking that every locale supplies that shape.

## Catalogs and keys

Catalogs are application-wide content assets in [`/messages`](../../../messages), one JSON file per supported locale. Import them with `@messages/*` only from [`messages.ts`](./messages.ts).

Keep the catalogs parallel. When adding a key, add its translation to every locale in the same change. Group keys by a durable feature or screen namespace, not by individual source file:

```json
{
  "AccountSettings": {
    "language": {
      "title": "Language"
    }
  }
}
```

Use ICU parameters instead of concatenating translated fragments:

```json
"memberCount": "{count, plural, =0 {No members} one {# member} other {# members}}"
```

`locales.ts` is the single source of truth for valid locales and the default. Adding a locale means updating that module and adding a complete catalog; do not add an ad hoc list in a feature.

## Server Components

Server Components are the default. `[locale]` is a Next.js root parameter: [`request.ts`](./request.ts) reads and validates it once through `next/root-params`, then next-intl supplies it to all server translation APIs. Do not await `params.locale` or pass it to `getTranslations` / `getLocale` from a page, layout, or metadata function. Those manual reads block Cache Components' static shell validation, even for locales returned by `generateStaticParams`.

For an async page, layout, or metadata function, use the server façade without a locale override:

```tsx
import { getTranslations } from "@/core/i18n/server"

export default async function ExamplePage() {
  const t = await getTranslations("Example")

  return <h1>{t("title")}</h1>
}
```

Use the same pattern in `generateMetadata`. When a layout needs the locale itself—for example, for `<html lang>`—use `getLocale` from `@/core/i18n/server`:

```tsx
import { getLocale } from "@/core/i18n/server"

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()

  return <html lang={locale}>{children}</html>
}
```

`generateStaticParams` remains responsible for the supported static locale variants. Do not import JSON catalogs or `messages.ts` from a route or feature; the root layout and request configuration provide the translation context.

For a synchronous Server Component, `useTranslations` is supported by next-intl. Prefer an async component with `getTranslations` when adding new page-level copy, so translation resolution stays in the central root-parameter-aware request configuration.

## Server Actions

Avoid i18n in Server Actions and the helpers they call. Return typed outcomes or stable error codes and translate them in the UI. Keep low-level services independent of translation APIs and message catalogs.

Keep Zod schemas as static, locale-neutral constants. Validation issues should carry stable IDs (and machine-readable parameters such as a minimum length), not translated text. Translate those IDs in the rendering layer, with the field label available; use `LocalizedFieldError` for standard field errors. This keeps schemas reusable in server and client code and avoids rebuilding them for each locale.

Only translate on the server when it must produce final text, such as an email. Choose the intended recipient's locale explicitly. `next/root-params` is unavailable in Server Actions and Route Handlers; server translation APIs need an explicit locale and request configuration that honors the override before reading root params.

## Client Components

Only use a Client Component for browser APIs or interaction. The root locale layout already supplies `NextIntlClientProvider`, so client code uses the hook:

```tsx
"use client"

import { useTranslations } from "@/core/i18n/translations"

export function SaveButton() {
  const t = useTranslations("Example")

  return <button type="submit">{t("save")}</button>
}
```

Do not call `getTranslations` in a Client Component, add another provider, or pass an entire catalog through feature props.

## Locale cookies

Use [`locale-cookie.ts`](./locale-cookie.ts) to read and write the locale cookie. It keeps browser writers, proxy synchronization, and next-intl's cookie configuration aligned. `NEXT_LOCALE` is the per-browser locale choice: it is authoritative when valid. A saved member locale is validated through [`locale-preference.ts`](./locale-preference.ts) and initializes that cookie only when the browser has no valid choice. The Account Settings control updates both values, so a member's saved preference becomes the current browser choice too.

## Verification

Run `bun run typecheck`, `bun run lint`, and `bun run build` after i18n changes. Verify every catalog contains the new key and that the localized static routes still appear in the build output.

For next-intl's broader server/client guidance, see [Server & Client Components](https://learn.next-intl.dev/chapters/03-translations/02-server-client-components).
