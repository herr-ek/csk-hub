# A Member locale is a default with per-browser overrides

CSK Hub supports English, Swedish, and German. A Member may save a preferred locale
on their account, but a valid `NEXT_LOCALE` cookie is an explicit choice for the
current browser and takes precedence over that saved value. When a browser has no
valid locale cookie, the Member's saved locale initializes one.

Public URLs remain locale-neutral: the locale is not a visible URL prefix. The
application's internal locale route parameter exists to render the selected locale,
not to make locale part of a shareable URL.

## Consequences

A Member can use a different language in different browsers without changing their
account preference. A new browser inherits the saved Member default until its user
chooses a language there. Updating the language in Account Settings updates both the
saved Member locale and the current browser cookie, making the new preference active
immediately.

The proxy must initialize the cookie on both the current request and its response:
the request write lets the locale router use the Member default immediately, while the
response write persists it for later requests.

[We considered making locale only a Member setting, only a browser cookie, or a URL
prefix. A Member-only setting would not permit browser-specific choices; a
cookie-only setting would not initialize new browsers from an account preference; and
a URL prefix would make locale part of every shared URL. This decision does not depend
on the current i18n library.]
