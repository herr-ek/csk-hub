# Member ID

Online visual verification for the iPhone companion. This identifies an active Hub account and
shows its current Choir affiliations; it does not certify paid membership or approve the photo.
Missing photos and accounts without Choir affiliations are allowed.

## HTTP contract

Use the existing Better Auth `/api/auth` endpoints to sign in and retain cookies. Cookie-bearing
POST requests require an `Origin` header matching Hub's configured origin. Signup remains disabled.
All member-ID responses use `Cache-Control: no-store, private`. Error bodies contain a stable `code`;
clients own their presentation and translation.

| Endpoint | Request | Response |
| --- | --- | --- |
| `GET /api/member-id/session` | Active, non-impersonated session | `{ member, canVerify }` |
| `POST /api/member-id/issue` | Same session; no body required | `{ token, issuedAt, expiresAt, rotateAfterMs }` |
| `POST /api/member-id/verify` | Active, non-impersonated Admin session; JSON `{ token }` | `{ member, verifiedAt }` |

`member` is `{ id, name, image, accountStatus: "active", choirs: [{ id, name }] }`.
`image` may be null. Choirs use org-structure's existing current/open-ended Membership semantics
and exclude archived Groups. All timestamps are Unix milliseconds. Rotation is 5,000 ms; validity
is 10,000 ms with an exclusive expiry. Clients must hide old codes on expiry, refresh failure and
backgrounding, and fetch a fresh code on foregrounding. Account/role UI hints never authorize scans.

Errors: `401 UNAUTHENTICATED` (including inactive callers), `403 FORBIDDEN`, `400 INVALID_CODE`
(including expired codes, inactive subjects and revoked sessions), `400 INVALID_REQUEST`,
`413 INVALID_REQUEST` (body over 4 KiB), `415 INVALID_REQUEST` (non-JSON verification), and
`503 UNAVAILABLE`. No response distinguishes a missing subject from a forbidden/invalid code.

## Token and privacy contract

QR values are versioned `csk-id:1:` AES-256-GCM ciphertext. A domain-separated HKDF key derives
from `BETTER_AUTH_SECRET`, so no extra deployment secret or schema migration is needed. Rotating
that secret invalidates outstanding IDs. Tokens contain a User ID, original session ID and issue
time, with a random nonce. They do not disclose those references or personal details to QR readers
and cannot authenticate any request. Do not put codes in URLs, logs, analytics or persistent storage.

Fresh authorization bypasses the auth cookie cache and reloads the caller's current account and
role. Verification also checks the subject's stored, unexpired, non-impersonated session and current
active account before reading profile/Choir data. These are request-time checks, not locks against
concurrent account changes. A successful result is a timestamped snapshot, not a lasting grant.

No attendance, scan records, token table or single-use registry is created. A code can be scanned
more than once during its ten-second lifetime. Live code forwarding is still possible; the Admin
compares the existing, user-editable photo with the person. Ordinary infrastructure access logs
may record endpoint requests, but code values travel only in POST bodies.

## Verification

`bun test src/features/member-id/token.test.ts src/core/authz/policies.test.ts test/authz.test.ts`
checks expiry boundaries, overlapping codes, tampering, encryption and role/impersonation policies.
The last file requires disposable local PostgreSQL databases. Also run typecheck and lint. Native
camera verification requires a supported physical iPhone; Simulator cannot exercise the scanner.
