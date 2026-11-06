# Registered applications and OIDC

Hub provides confidential authorization-code OIDC using Better Auth 1.7.18. Clients
use S256 PKCE and `client_secret_basic`. The identity key is `(iss, sub)`; `sub` is
the permanent Hub User ID. Never key accounts by name or email, or recycle User IDs.
This delivery supports `openid` and `profile`. Website permission scopes and claims
are delivered separately; identity alone grants no application administration.

## Configure a deployment

Set `BETTER_AUTH_URL` to the application's origin and `OIDC_ISSUER` to that origin
plus `/api/auth`, without a trailing slash. Both metadata and ID tokens use this
exact issuer. Production and preview require HTTPS. A preview issuer must belong
to the exact injected `VERCEL_URL`, not a production URL or branch alias. Select
production values from the actual deployment. Do not change an established issuer
without treating it as a new identity provider.

Use separate databases, `BETTER_AUTH_SECRET` values, clients and callbacks for
production, previews and local development. Never copy production provider state
into previews. HTTPS callbacks match exactly, including trailing slash. The
provider permits HTTP only for loopback callbacks in development/test; register
such clients as `application_type: native` through the administrator server API.
No resource audience, refresh token or offline access is needed for identity.

Generate secrets with the existing environment setup. Keep `BETTER_AUTH_SECRET`
stable and private: it encrypts persisted signing keys and authenticates signed
continuations. It must survive restarts. Back up the database and encryption secret
together under the existing access controls.

Before deploying the application, review the additive `add-oidc-provider` migration
and apply it through `bun run ops migrate` (or the guarded `--prod` workflow).
It adds provider clients, resources/links, tokens, consents, assertion replay state
and JWKS; it changes no existing User/account/session rows. Refresh-token and
resource tables belong to the supported provider schema even though their grants
are not enabled. Do not seed applications into production from development data.

Verify these URLs on the deployed host through the actual reverse proxy:

- `{issuer}/.well-known/openid-configuration`
- `{origin}/.well-known/oauth-authorization-server/api/auth`
- `{issuer}/jwks`

Discovery must contain the configured issuer, correct HTTPS endpoints, S256,
`authorization_code`, and only the enabled scopes. Metadata bypasses locale
routing. Do not publish or cache private keys. UserInfo and client-management
responses use `Cache-Control: no-store`.

## Administrator workflow

Sign into Hub as an active Admin. Impersonation is not allowed for provider
administration or authorization. The JSON endpoints below accept the Hub browser
session; mutations also require an `Origin` header equal to the Hub origin. Use the
same-origin browser console or an authenticated administrative HTTP client. Avoid
shell history and shared terminals when handling returned credentials.

| Operation | Request |
| --- | --- |
| Create | `POST /api/oidc/clients` |
| Inspect owned clients | `GET /api/oidc/clients` |
| Update or disable | `PATCH /api/oidc/clients` |
| Rotate secret | `POST /api/oidc/clients/rotate-secret` |

Create body (substitute the real, exact callback):

```json
{
  "client_name": "Application name",
  "redirect_uris": ["https://application.example/callback/"],
  "scope": "openid profile",
  "skip_consent": false
}
```

The creation response contains `client_id` and a one-time `client_secret`. Transfer
them directly into the application's server secret store. Registration enforces
confidential Basic authentication, public subjects and PKCE. Never put the secret
in browser code. The public-client endpoint exposes display fields only; dynamic
and unauthenticated registration are disabled. Ordinary Users cannot manage
clients. Provider privilege checks also protect direct server APIs and resource
management: an API name containing `admin` is not the authority boundary.

Set `skip_consent: true` only when explicitly registering the trusted website.
Trust is an administrator-controlled persisted client field; changing request
parameters or editable metadata cannot confer it. Other applications show their
name and requested identity/profile access and must receive consent. Each client
has separate credentials, exact callbacks and permitted scopes. The provider
exposes ordinary management paths too, but every one checks current active Admin
authority. Read, list, rotate and delete retain provider ownership checks; restricted
Admin updates may manage another Admin's client.

Update body:

```json
{
  "client_id": "REGISTERED_CLIENT_ID",
  "update": {
    "client_name": "Updated name",
    "redirect_uris": ["https://application.example/new-callback/"],
    "scope": "openid profile",
    "skip_consent": false,
    "disabled": true
  }
}
```

Rotation body is `{"client_id":"REGISTERED_CLIENT_ID"}`. Rotation immediately
invalidates the old client secret; coordinate the application's secret change and
expect a brief exchange failure during cutover. Previously issued identity tokens
remain verifiable until expiry. Rotation revokes already-issued opaque access tokens, including their UserInfo
access; disable the client first when responding to compromise. Disabled clients
cannot issue credentials or use UserInfo/introspection with existing opaque tokens.
Re-enabling is an explicit Admin update. Revoking an application access token at
the discovery revocation endpoint leaves the Hub browser session intact.

## Sign-in and account withdrawal

Clients generate and retain state, nonce and a PKCE verifier, verify the callback
state/issuer, then validate the ID token signature, issuer, audience and nonce with
a conventional OIDC library. A callback without the exact registered trailing slash
fails. Identity/profile tokens are opaque access tokens tied to the originating
stored Hub session; they are not general Hub API credentials.

The provider signs its authorization request and carries it through login,
two-factor, passkeys, email OTP, magic links and required password activation.
Magic-link callbacks and activation use `/api/oidc/resume`; it verifies the signed
request through the provider before continuing. No external return URL is accepted
as a substitute for the registered callback. Ordinary Hub login keeps its existing
internal `returnTo` behavior. Expired or tampered continuations require restarting
from the application. An old/revoked Hub cookie cannot resume authorization.

Issuance rechecks current User state, and UserInfo rechecks both the User and the
originating session. Inactive Users and erased Users cannot obtain usable access
through cached cookies, old codes or stored opaque tokens. All impersonated
sessions are rejected, so support cannot export the support actor's authority.
An already issued ID token remains a signed historical authentication statement;
clients must use the current UserInfo/access-token boundary for ongoing access.

## Signing keys and diagnostics

RS256 signing keys are stored in PostgreSQL with encrypted private keys. Rotation
occurs after thirty days on signing; previous public keys remain available for a
one-day verification overlap, longer than the provider's ID-token lifetime.
Restarts retain the active key. Do not remove old public keys until issued tokens
and overlap have expired. Restore the same encryption secret when restoring the
database. Rotating that secret requires a separate coordinated re-encryption/key
migration; changing it in place prevents decrypting existing private keys.

Provider endpoint rate limits remain enabled. Failure responses use protocol error
categories. Do not log Authorization headers, client secrets, codes, access tokens,
magic-link contents or full authorization URLs. The Next.js development request
logger excludes authentication and continuation routes. Do not enable request-body
logging in the deployment proxy. Email log mode is for isolated local fixtures;
production authentication mail must use SMTP and private delivery.

## Verification

`bun test src/core/auth/oidc-provider.test.ts` runs against a disposable, fully
migrated local PostgreSQL database. CI requires it and cannot count a missing
database as a successful skipped suite. `bun run test:e2e` launches a separate
migrated database, Next.js and a disposable HTTPS callback server. Install Chromium
with `bun x playwright install chromium` first. Tests never migrate or seed the
development/production database. CI runs both suites, typecheck, lint and build.
The GitHub **Verify / verify** check must be required by branch protection before
merging changes to this boundary.

The HTTP suite verifies identity, consent, exact redirects, PKCE and credential
failures, state/nonce checks, code lifetime/reuse, account/session withdrawal,
client administration, passwordless/two-factor/activation continuity, restart and
key-rotation overlap. Browser coverage verifies real UI login and session reuse,
consent and cancellation through locale/proxy routing.
