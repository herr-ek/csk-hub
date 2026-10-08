# Authentication findings

Snapshot: 2026-09-23 at `930a2a5`. [Review index](README.md) · [Policy recommendation](access-control.md). Native-handler probes used an in-memory store and fake email callbacks; they did not exercise the deployed application.

<a id="auth-001"></a>

## AUTH-001 — Email OTP exposes public registration in an Invite-only product

- Type: security risk. Priority: **Blocker** for production readiness. Confidence: **Confirmed**.
- Evidence: `src/core/auth/auth.ts:27` registers emailOTP without `disableSignUp`; password registration is disabled separately at `:63`, and magic-link registration separately at `:35`. `src/app/api/auth/[...all]/route.ts:4` publishes native GET/POST endpoints. `CONTEXT.md` defines membership as Invite-only.
- Observed fact: installed `node_modules/better-auth/dist/plugins/email-otp/routes.mjs:102` sends sign-in OTPs to unknown addresses unless the plugin's own disableSignUp is true; `:412` checks that same option and `:414-437` creates the User/session. Root credential disableSignUp does not apply. `src/core/email/senders/auth.ts:39` supports dispatching sign-in OTPs.
- Reproduction: POST send-verification-otp `{email: never-invited@example.test, type: sign-in}` returned 200; POST sign-in/email-otp with captured code returned 200, a new User with role user, and a session. No Invite occurred.
- Product impact/inference: anyone controlling an email address can become an authenticated User and reach shared member surfaces, violating the central membership boundary.
- Recommendation/boundary: set plugin `disableSignUp: true` immediately in core/auth; inventory enabled native auth capabilities by product purpose and disable unused HTTP sign-in endpoints. Treat the native HTTP surface as part of access control, independent of UI availability. Coordinate AUTH-003: preventing new Users alone does not close email-only authentication for existing Users.
- Alternative/tradeoff: remove emailOTP only if replacing the existing email-verification workflow. Keeping it with explicit registration/sign-in restrictions preserves that workflow with small change.
- Dependencies/effort: no migration; **S** for immediate fix; coordinated endpoint policy **M**.
- Acceptance/verification: unknown email cannot create User through any exposed sign-in endpoint; Admin Invite then activation still succeeds; existing email verification and intended password/2FA flows succeed. Include a native-handler integration assertion against a disposable store; checking the login UI alone cannot verify this property.
- Official corroboration: [Email OTP registration behavior/options](https://better-auth.com/docs/plugins/email-otp#options). Installed source is authoritative if current docs advance.

<a id="auth-002"></a>

## AUTH-002 — Wildcard Vercel trust lets reset tokens leave the application

- Type: security risk. Priority: **High**. Confidence: **Confirmed**.
- Evidence: `src/core/auth/auth.ts:53-56` uses dynamic baseURL with `allowedHosts: ["*.vercel.app"]` in every environment. Installed `better-auth/dist/context/helpers.mjs:61-70` expands these hosts into trusted origins, including all HTTPS Vercel tenants; fallback is added but does not narrow them. `better-auth/dist/api/routes/password.mjs:49` validates redirectTo against that trust; `:80-85` embeds it in the real emailed reset URL; `:122-127` redirects a valid reset with its token to that callback.
- Observed fact/reproduction: request-password-reset for a disposable existing User with redirectTo `https://unrelated-review-tenant.vercel.app/collect` returned 200; opening the captured legitimate reset URL returned 302 to that unrelated origin with a `token` query parameter.
- Impact/inference: an attacker controlling a Vercel tenant can request a victim's reset email whose legitimate app link sends the reset credential to the attacker if the victim opens it. No Host-header exploit or browser CSRF bypass is needed for this demonstrated chain. Token possession permits password reset; MFA implications depend on remaining alternate sign-in paths.
- Recommendation/boundary: core/auth + deployment configuration should trust only explicit app-owned production/preview origins. Derive an exact current preview host from trusted deployment configuration or enumerate owned hosts; do not trust the provider's shared domain. Constrain reset/activation callback paths to intended local workflows where practical.
- Tradeoff: exact preview origins require deployment wiring, but shared hosting domain ownership is not an app trust boundary. A project-scoped wildcard is only acceptable when all matching hostnames are demonstrably controlled by this project.
- Dependencies/effort: environment configuration; **S/M**. Does not require application-policy library.
- Acceptance/verification: unrelated `*.vercel.app` origins rejected for reset and magic-link callbacks and auth origin checks; local intended callback still works on production and legitimate preview deployment. Probe redirect locations without sending real emails. Verify trusted origins derived at runtime, not just the text of trustedOrigins config.
- Source: [Better Auth options](https://better-auth.com/docs/reference/options) (checked during consolidation). Exact behavior was verified in installed source and the disposable probe.

<a id="auth-003"></a>

## AUTH-003 — Public email-only sign-in routes bypass enabled 2FA

- Type: security risk. Priority: **High**. Confidence: **Confirmed** for endpoint behavior; product recovery policy is unresolved.
- Evidence: `src/core/auth/auth.ts:17-41` simultaneously enables twoFactor, emailOTP, and magicLink; no route restriction. Invite uses magic link (`src/features/user-management/invite-user.ts:53-62`), but the plugin also publishes its ordinary public sign-in route. Installed `better-auth/dist/plugins/two-factor/index.mjs:245-247` challenges only `/sign-in/email`, `/sign-in/username`, and `/sign-in/phone-number`; neither email OTP nor magic-link verification matches. The respective plugins create sessions directly.
- Observed/reproduced: existing User with `twoFactorEnabled: true` obtained a session token from email OTP with no twoFactorRedirect. Magic-link verification for that same User returned 302 with session cookie. No password, authenticator code, or backup code was used. This persists after AUTH-001 is fixed.
- Impact/inference: mailbox access alone obtains a session for an account whose settings say two-factor is enabled. Passkey login is a deliberate separate authentication mechanism and is **not** alleged to be a defect here. The app's email OTP second factor still requires a preceding password; these alternate public sign-in endpoints do not.
- Recommendation/boundary: decide/document supported authentication and account-recovery semantics in core/auth. Given current UI and Invite model, close unused HTTP `/sign-in/email-otp` and public magic-link issuance while retaining authorized server-side Invite delivery; constrain activation links to activation rather than a reusable secondary login route. If email-only recovery is intentional, describe it explicitly and design a separate recovery process instead of inheriting it accidentally from installed plugins.
- Tradeoff: Better Auth `disabledPaths` is checked at HTTP router level (`dist/api/index.mjs:166-168`), so it can preserve server API use; verify that behavior against current integration before implementing. Disabling magic-link verification globally would break Invite activation and is not recommended.
- Dependencies/effort: AUTH-001; activation/resend Invite workflow; native endpoint policy; **M**.
- Acceptance/verification: enabled-2FA User cannot obtain a normal session through any email-only endpoint outside an explicitly approved recovery protocol; invited passwordless User can still activate; resend behavior defined; username/password challenge and OTP/TOTP/backup verification unchanged. Test endpoints directly with 2FA both enabled and disabled.
- Official context: [Two-factor plugin](https://better-auth.com/docs/plugins/2fa), [Magic-link plugin](https://better-auth.com/docs/plugins/magic-link), [Email OTP plugin](https://better-auth.com/docs/plugins/email-otp). These were opened; the version-specific hook matcher above is the decisive evidence.

<a id="auth-004"></a>

## AUTH-004 — Cookie-cached identity survives session revocation and role changes

- Type: security risk / architecture risk. Priority: **High**. Confidence: **Confirmed**.
- Evidence: `src/core/auth/auth.ts:71-75` enables a 300-second session cookie cache. `src/core/auth/session.server.ts:19-24`, `src/core/auth/permissions.server.ts:84-94`, and `src/proxy.ts:14` read getSession with no disableCookieCache. `permissions.server.ts:164-184` authorizes Admin from roles in that session. Installed `better-auth/dist/api/routes/session.mjs:48-152` returns valid signed cached session data before the database lookup at `:153`.
- Observed/reproduced: after deleting all disposable User sessions, get-session with its prior signed cache remained authenticated while get-session?disableCookieCache=true returned null. Deactivation/role demotion cache implications follow the same data path.
- Nuance: Better Auth 1.7.4 native Admin handlers use authoritative session middleware (`plugins/admin/routes.mjs:16-20`) and therefore are not all bypassable with a stale cookie. Application permission reads call userHasPermission with a User ID, which refreshes role but does not establish that this session remains valid. Do not claim every endpoint accepts revoked sessions. Messaging validates recipient activity, but its current identity helper does not recheck sender activity or impersonation.
- Product impact/inference: users signed out/revoked elsewhere can still pass application identity checks for up to five minutes; cached Admin roles can authorize app-owned code that trusts requireAdmin. A deactivated User's session cache still establishes identity unless each workflow independently rechecks activity. Session revocation and inactive access guarantees are inconsistent across native/app paths.
- Recommendation/boundary: choose one authoritative request actor resolver in core/auth/application-policy that validates current session and User state for private reads/mutations, especially privilege changes. Simplest for this association-sized app: disable cookie cache globally; alternative: retain cache for non-authoritative display while all enforcement bypasses it. Request-local memoization can avoid repeated database reads without cross-request staleness.
- Tradeoff: additional DB reads versus reliable revocation. Avoid inventing a distributed invalidation system for this scale.
- Dependencies/effort: root access-control design and all actor loaders; **M**.
- Acceptance/verification: retain old cookies, revoke session/demote/deactivate from another session, then immediately verify direct Server Actions, private reads, policy checks, and native handlers deny appropriately. Native role/state checks are not a substitute for checking the session itself. Record intentionally tolerated staleness only if product accepts it.
- Official source: [Session management / cookie cache](https://better-auth.com/docs/concepts/session-management).

<a id="auth-005"></a>

## AUTH-005 — Successful password reset is represented as failure when 2FA follows

- Type: bug. Priority: **Medium**. Confidence: **Confirmed** by source; no browser repro.
- Evidence: `src/features/account/password-reset/service.ts:14-16` represents success only with a completed sign-in; `:41-50` resets first and then signs in; `:52-56` collapses every non-success sign-in, including the known requiresTwoFactor result from `src/features/account/login/service.ts:12-15,57-64`, into generic failure. `password-reset-form.tsx:32-37` leaves the reset form displayed. The reset token has already been consumed by Better Auth (`api/routes/password.mjs:156-158`).
- Fact: a 2FA challenge is a normal next step, but the reset UI loses available methods and asks the User to sign in again. Retrying the displayed reset form now yields an invalid token. The message does say the password changed, which mitigates confusion, but the state machine still treats a completed irreversible step as retryable failure.
- Recommendation/boundary: password-reset workflow should distinguish password update completion from authentication completion, preserve challenge information, and transition to existing twoFactorPath. For other post-reset sign-in errors show a terminal reset-complete state with login action; never present another reset submit for a consumed token.
- Alternative/tradeoff: always finish reset with a success screen and explicit login link; simpler but adds a step for all Users. Do not weaken 2FA to achieve auto-login.
- Dependencies/effort: login result/navigation seam; **S**. Coordinate runtime agent's form subscription issue rather than duplicating it.
- Acceptance/verification: successful update + 2FA challenge goes to 2FA; successful update + network/login error remains reset-complete; invalid token remains reset failure; a retry cannot inadvertently use the consumed reset token. One service/state test per distinct post-update outcome is sufficient.

