# Hub OIDC provider

Hub uses Better Auth's OAuth Provider and JWT plugins. Registered applications use
confidential authorization-code flow with S256 PKCE and `client_secret_basic`.
Supported scopes are `openid` and `profile`; application roles and permissions are
separate work. Identity is the stable `(iss, sub)` pair, with `sub` equal to the Hub
User ID.

## Deployment

- Set `BETTER_AUTH_URL` to the deployment origin and `OIDC_ISSUER` to that origin
  plus `/api/auth`, without a trailing slash. Production and preview require HTTPS;
  previews must use their exact `VERCEL_URL` origin.
- Keep databases, clients, callbacks and secrets separate between deployments.
- Preserve `BETTER_AUTH_SECRET`: it encrypts persisted signing keys and signs
  authorization continuations. Back it up with the database. Changing it requires
  a coordinated key migration.
- Review and apply the additive `add-oidc-provider` migration through the existing
  `bun run ops migrate` workflow. It preserves existing Users, accounts and sessions.
  The generated provider schema includes resource and refresh-token tables even
  though this setup does not enable those capabilities.

Check discovery through the deployment's proxy:

- `{issuer}/.well-known/openid-configuration`
- `{origin}/.well-known/oauth-authorization-server/api/auth`
- `{issuer}/jwks`

RS256 keys persist in PostgreSQL. Keys rotate after thirty days on signing, with a
one-day verification overlap. Do not delete old keys while issued tokens need them.

## Client administration

An active Admin can register an application on the Admin page. Enter its name and
exact HTTPS callback URLs, including any trailing slash. Enable profile access if
needed; skip consent only for an explicitly trusted application. Save the returned
client ID and one-time secret in the application's server secret store.

The following endpoints use the Admin's Hub session. Mutations require a same-origin
`Origin` header. Provider hooks check current active Admin authority and reject
impersonation, including when called through the underlying Better Auth APIs.

| Operation | Request body |
| --- | --- |
| `POST /api/oidc/clients` | `{ "client_name": "Application", "redirect_uris": ["https://app.example/callback/"], "scope": "openid profile", "skip_consent": false }` |
| `GET /api/oidc/clients` | None; lists clients owned by the current Admin |
| `PATCH /api/oidc/clients` | `{ "client_id": "…", "update": { "disabled": true } }` |
| `POST /api/oidc/clients/rotate-secret` | `{ "client_id": "…" }` |

Updates also accept name, callbacks, scope and consent settings. Secret rotation
invalidates the old secret and revokes existing client access tokens. Disabling a
client blocks issuance and UserInfo access. Already-issued ID tokens remain signed
historical statements until expiry. Dynamic registration is disabled.

For loopback HTTP callbacks in development/test, register a native application
through the administrator server API. Production callbacks require HTTPS.

## Authentication and withdrawal

Better Auth carries a signed authorization request through login, two-factor,
passkeys, email OTP, magic links and required activation. Consent verifies that
signature before rendering. Magic links and activation resume through
`/api/oidc/resume`; ordinary Hub login retains its existing destination behavior.

Issuance checks current User state. UserInfo also checks the originating stored Hub
session. Inactive/erased Users, ended sessions and impersonated sessions cannot
retain access through cached cookies. Token revocation leaves Hub browser login
intact. Consumers must validate state, nonce, issuer, audience and token signatures
with an OIDC library, and use current UserInfo for ongoing account/session checks.

Do not log credentials, codes, tokens or full authorization URLs. Development auth
request logging is suppressed; configure production proxy logging separately.

## Local verification

With local PostgreSQL configured in `.env`, run:

```sh
bun --env-file=.env test src/core/auth/oidc/provider.test.ts
bun run typecheck
bun run lint
bun --env-file=.env run build
```

The HTTP tests create and drop a disposable migrated database. They cover the
identity flow, Hub authority and withdrawal rules, consent, login continuation,
client administration and key persistence. A missing database skips the suite and
is not verification. CI and Playwright are outside the current setup.

Before deployment, manually check fresh login, session reuse, two-factor, passkeys,
activation, consent approval/cancellation and callback routing through Next.js.
