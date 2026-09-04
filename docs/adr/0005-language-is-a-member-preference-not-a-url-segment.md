# Language is a Member preference, not a URL segment

A Member's Language lives on their `user` row, with a `NEXT_LOCALE` cookie as the read
path; it is never a segment in the URL. The Hub is entirely behind a login and has no
SEO surface, so the usual argument for `/sv/news` — a distinct address per language that
search engines and sharers can hold onto — buys nothing here, while costing every route
a locale prefix and every shared link a language its recipient may not read. `/news/abc`
stays one address for the whole choir.

We considered nesting the route tree under `app/[lang]/` and reading the Language with
`next/root-params`. That is the path Next.js and next-intl both point at: next-intl
closed its long-running Cache Components issue (amannn/next-intl#1493) precisely when
`next/root-params` shipped in Next 16.3, on the grounds that root parameters are the
proper fix. Root parameters are URL-derived by definition, so choosing a cookie puts us
off that path deliberately.

## Consequences

`cacheComponents` is enabled in `next.config.ts`, and the Language is not known until a
request reaches the server. The root layout must therefore block to render
`<html lang>` correctly, and components reading translations need Suspense boundaries
above them. In practice the app was already shaped this way — every page is a thin shell
with session-reading work behind `<Suspense>` — but the root layout was not, and this
decision is what makes it dynamic. If the combination proves unworkable, the thing to
give up is `cacheComponents`, not the correct `lang` attribute: a wrong `lang`
mispronounces the entire interface in a screen reader, and this application has Swedish,
English and German speakers in it by design.

Nothing can be statically prerendered per language, which costs us nothing we had. The
`next/root-params` API stays unavailable, so the Language reaches Server Components
through the next-intl request config rather than a getter, and Client Components get it
from the provider.

Because the Language rides on the Member rather than the URL, it follows a singer across
devices, and an Admin sharing a link never accidentally imposes their own language on
the reader.
