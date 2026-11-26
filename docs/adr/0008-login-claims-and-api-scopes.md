---
status: proposed
---

# Login claims and API scopes are separate concepts

A client that signs Users in receives login claims: information the Hub releases about the
signed-in User in UserInfo. A client's access token also carries API scopes, which say what the
token may do against Hub APIs. The two are configured and enforced separately and are never mixed.

Login claims are grouped into claim groups, such as website access or Bookie access. The Hub
computes each group's value for the User, so eligibility rules stay in the Hub and a client never
sees the rules that produced a value. A group releases one list-valued claim, and a User who
qualifies for nothing in a group gets no claim for it.

API scopes come in two kinds, decided by prefix and bound to the grant that may issue them.
`user:` scopes are delegated access: they act on behalf of the signed-in User and are issued only
through `authorization_code`. `api:` scopes are machine access: no User is involved and they are
issued only through `client_credentials`. The User of a delegated token comes only from the token's
`sub`; no route accepts a User id from the request.

`api:` scopes give a client data without any User's restrictions, so they are privileged grants
that an Admin enables deliberately. `user:` scopes carry less risk, because the User's own
restrictions still apply to them. All client configuration remains Admin-only.

Claim settings are stored in client `metadata`, under a single `csk` key that the Hub owns, and
written with a merge so the plugin's own keys survive. This avoids a migration while the set of
claim groups is small. Move these settings to a table when a claim group needs settings per
client, when an audit trail is required, or when the plugin changes how it handles `metadata`.

## Consequences

Nothing in the catalogue is a `user:` or `api:` scope yet. The infrastructure and admin form
accept both kinds, and tests inject entries to prove the grant rules, so adding a real scope is a
catalogue change plus its route.

Verifying access tokens in Hub routes is deferred to the first `user:` or `api:` route. The
provider only verifies tokens inside its own endpoints, and verifying them in a route needs either
an audience with JWKS verification or introspection by a confidential client. That route chooses
between them, then adds one shared helper returning a delegated or machine caller.

A website or Bookie client has to request `openid profile` and read the list claims instead of
the boolean claims that the earlier draft of this work released. Enforcement in those applications
must change with this decision.

This draft records the design discussion, not team approval.
