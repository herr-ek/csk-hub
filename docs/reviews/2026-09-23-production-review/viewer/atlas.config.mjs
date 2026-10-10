// Curated navigation. Finding bodies remain in the historical Markdown reports.
export const head = "930a2a527b5f124e9a764b224f32994651a417b6"
const module = (id, name, path, entry, description, layer = "core") => ({ id, name, path, entry, description, layer })
export const modules = [
  module(
    "app",
    "Routes & proxy",
    "src/app",
    "src/proxy.ts",
    "Locale-neutral URLs, route decisions, Suspense entrypoints and a separate native auth HTTP surface.",
    "entry"
  ),
  module(
    "account",
    "Account",
    "src/features/account",
    "src/features/account/index.ts",
    "Sign-in, Invite activation, recovery and account security settings.",
    "feature"
  ),
  module(
    "users",
    "User management",
    "src/features/user-management",
    "src/features/user-management/actions.ts",
    "Invites, imports, activity, roles and support impersonation.",
    "feature"
  ),
  module(
    "posts",
    "Posts",
    "src/features/posts",
    "src/features/posts/service.ts",
    "Published news reads and authorized plain-text publication.",
    "feature"
  ),
  module(
    "auth",
    "Authentication",
    "src/core/auth",
    "src/core/auth/auth.ts",
    "Better Auth plugins, session identity, coarse grants and route policy."
  ),
  module(
    "messaging",
    "Messaging",
    "src/features/messaging",
    "src/features/messaging/sending/send-message.ts",
    "Private Direct Conversations, atomic sends, exact-intent retries and read cursors.",
    "feature"
  ),
  module(
    "notifications",
    "Push adapter",
    "src/core/notifications",
    "src/core/notifications/send-push-notification.ts",
    "Browser subscription bindings, recipient eligibility and provider transport."
  ),
  module(
    "broadcast",
    "Broadcast UI",
    "src/features/notification-broadcast",
    "src/features/notification-broadcast/actions.ts",
    "Admin-selected or association-wide manual notifications.",
    "feature"
  ),
  module(
    "db",
    "Database",
    "src/core/db",
    "src/core/db/index.ts",
    "PostgreSQL connection and auth, messaging, Post, push and preference schemas."
  ),
  module(
    "config",
    "Configuration",
    "src/core/config",
    "src/core/config/env.ts",
    "Runtime environment validation and deployment-mode decisions."
  ),
  module(
    "email",
    "Email",
    "src/core/email",
    "src/core/email/client.ts",
    "SMTP/log adapter, bounded batches and auth workflow templates."
  ),
  module(
    "i18n",
    "Internationalization",
    "src/core/i18n",
    "src/core/i18n/server.ts",
    "Locale routing, browser override, catalog contracts and formatters."
  ),
  module(
    "navigation",
    "Navigation",
    "src/core/navigation",
    "src/core/navigation/navigation-utils.ts",
    "Return destinations, visible links and sign-out/impersonation escape."
  ),
  module(
    "preferences",
    "Preferences",
    "src/core/preferences",
    "src/core/preferences/user-preferences.ts",
    "Runtime-validating JSONB defaults and atomic partial preference updates."
  ),
  module(
    "shared",
    "Shared UI",
    "src/shared",
    "src/shared/schemas.ts",
    "Universal validation, layouts and Base UI presentation primitives.",
    "shared"
  ),
  module(
    "tooling",
    "Tooling",
    "scripts",
    "package.json",
    "Dependency declarations, seeds, test setup and generation configuration.",
    "ops"
  ),
  module(
    "docs",
    "Domain & guides",
    "docs",
    "CONTEXT.md",
    "Vocabulary, ADRs, structural rules and repository instructions.",
    "context"
  ),
  module(
    "shell",
    "App infrastructure",
    "src/core",
    "src/core/logging/logger.ts",
    "Theme, logging and other cross-cutting infrastructure."
  )
]
modules.forEach((m, i) => {
  m.x = 55 + (i % 4) * 240
  m.y = 55 + Math.floor(i / 4) * 170
})
const mark = (file, from, to, label) => ({ file, from, to, label })
export const annotations = {
  "AUTH-001": [
    mark("src/core/auth/auth.ts", 27, 33, "Email OTP has no plugin-specific signup restriction"),
    mark("src/app/api/auth/[...all]/route.ts", 1, 4, "Native HTTP endpoints are exposed independently"),
    mark("src/core/email/senders/auth.ts", 28, 55, "Sign-in OTP dispatch is supported")
  ],
  "AUTH-002": [mark("src/core/auth/auth.ts", 53, 56, "Trust expands to the shared Vercel domain")],
  "AUTH-003": [
    mark("src/core/auth/auth.ts", 17, 41, "Alternate email sign-in plugins coexist with 2FA"),
    mark("src/features/user-management/invite-user.ts", 53, 62, "Invite activation must survive endpoint restrictions")
  ],
  "AUTH-004": [
    mark("src/core/auth/auth.ts", 71, 75, "Identity can come from a 300-second cookie cache"),
    mark("src/core/auth/session.server.ts", 19, 24, "No authoritative session bypass"),
    mark("src/core/auth/permissions.server.ts", 84, 94, "Actor construction starts from a cached session"),
    mark("src/core/auth/permissions.server.ts", 164, 184, "Admin role can come from that actor"),
    mark("src/proxy.ts", 14, 16, "Proxy also accepts cached identity")
  ],
  "AUTH-005": [
    mark(
      "src/features/account/password-reset/service.ts",
      39,
      61,
      "Reset commits before the sign-in outcome is classified"
    ),
    mark(
      "src/features/account/password-reset/password-reset-form.tsx",
      29,
      39,
      "The consumed-token form remains after the failure result"
    )
  ],
  "AUTHZ-001": [
    mark("src/features/user-management/actions.ts", 45, 56, "Final-Admin count is separate from mutation"),
    mark("src/features/user-management/actions.ts", 87, 107, "Activity-change action owns target rules"),
    mark("src/features/user-management/actions.ts", 156, 175, "Role action owns rules absent from native setters"),
    mark("src/core/auth/permissions.ts", 36, 50, "Native Admin grants remain broad")
  ],
  "AUTHZ-002": [
    mark("src/core/auth/session.server.ts", 19, 25, "Only effective User identity survives"),
    mark("src/core/auth/route-access.ts", 77, 81, "Route policy blocks impersonated messaging"),
    mark("src/features/messaging/sending/send-message.ts", 12, 28, "Callable command has no impersonation guard"),
    mark("src/features/messaging/ui/conversation/read.ts", 11, 29, "Cursor command accepts effective identity"),
    mark("src/features/account/settings/account-settings.tsx", 25, 30, "Security settings remain available")
  ],
  "ARCH-001": [
    mark("src/core/db/index.ts", 1, 11, "Sensitive leaf lacks server-only poisoning"),
    mark("src/core/config/env.ts", 1, 5, "Configuration leaf depends on caller discipline"),
    mark("src/features/user-management/service.ts", 7, 27, "Sensitive read exports do not require an actor"),
    mark("src/features/posts/service.ts", 22, 46, "Internal reads rely on caller contracts")
  ],
  "OPS-001": [mark("src/core/db/index.ts", 4, 9, "TLS mode is rewritten to disable certificate verification")],
  "OPS-002": [
    mark("src/core/config/env.ts", 3, 27, "Environment precedence and optional-value validation"),
    mark("src/core/config/env.ts", 50, 57, "Validated mode differs from isProduction"),
    mark("src/core/email/client.ts", 23, 34, "Production may keep local-log delivery")
  ],
  "OPS-003": [
    mark(
      "src/features/messaging/ui/message-command-result.ts",
      8,
      18,
      "Unexpected failures are flattened without diagnostics"
    ),
    mark("src/core/auth/route-access.ts", 85, 90, "Infrastructure failures become forbidden")
  ],
  "TOOL-001": [
    mark("package.json", 20, 55, "Direct runtime imports and generator versions need alignment"),
    mark("src/core/db/index.ts", 1, 2, "Runtime node-postgres adapter"),
    mark("src/features/account/login/login-form.tsx", 1, 5, "Direct form package import")
  ],
  "DOC-001": [
    mark("README.md", 11, 13, "Product inventory is stale"),
    mark("README.md", 86, 111, "Route and setup entry map disagrees with source"),
    mark(
      "src/features/messaging/sending/README.md",
      115,
      117,
      "Operational error contract promises retained diagnostics"
    )
  ],
  "NOTIFY-01": [
    mark(
      "src/features/account/settings/notifications/push-notification-actions.ts",
      17,
      29,
      "Direct action accepts TypeScript-only subscription input"
    ),
    mark(
      "src/core/notifications/subscription.ts",
      13,
      35,
      "Caller endpoint and keys are stored without runtime validation"
    ),
    mark("src/core/notifications/send-push-notification.ts", 22, 28, "Stored destination reaches web-push")
  ],
  "NOTIFY-02": [
    mark(
      "src/core/notifications/send-push-notification.ts",
      68,
      85,
      "Recipient selection checks device status, not User activity"
    ),
    mark("src/core/notifications/subscription.ts", 45, 58, "Recipient picker also lacks the activity predicate"),
    mark("public/service-worker.js", 1, 11, "Receipt needs no current application session")
  ],
  "NOTIFY-03": [
    mark(
      "src/features/account/settings/notifications/push-notification-settings.tsx",
      28,
      40,
      "Browser object is treated as current User binding"
    ),
    mark("src/core/notifications/subscription.ts", 13, 35, "Endpoint ownership lives separately on the server"),
    mark("src/core/navigation/logout-button.tsx", 14, 22, "Sign-out does not reconcile the binding")
  ],
  "NOTIFY-04": [
    mark(
      "src/core/notifications/send-push-notification.ts",
      22,
      56,
      "No delivery deadline; metadata write affects provider outcome"
    )
  ],
  "WEB-001": [
    mark("src/core/navigation/navigation-utils.ts", 4, 21, "Raw prefix checks preserve control-character destinations"),
    mark("src/features/account/login/login-form.tsx", 25, 38, "Accepted destination reaches router.replace")
  ],
  "WEB-002": [
    mark(
      "src/features/account/password-reset/password-reset-request-form.tsx",
      50,
      57,
      "Reads stable FormApi state without subscribing"
    ),
    mark(
      "src/features/account/password-reset/password-reset-form.tsx",
      53,
      60,
      "Pending state is a plain render-time read"
    ),
    mark("src/features/account/login/login-form.tsx", 72, 72, "Existing subscribed precedent")
  ],
  "WEB-003": [
    mark("src/features/account/two-factor/use-two-factor-form.ts", 23, 45, "Rejected await bypasses pending cleanup"),
    mark(
      "src/features/account/settings/security/two-factor/use-two-factor-settings.ts",
      19,
      56,
      "Security writes leave uncertain client state"
    ),
    mark("src/core/navigation/logout-button.tsx", 14, 22, "Sign-out failure has no visible result")
  ],
  "WEB-004": [
    mark("src/proxy.ts", 33, 35, "Denied route emits an empty body"),
    mark("src/core/navigation/app-navigation.tsx", 25, 34, "Messages remains visible while impersonating"),
    mark("src/features/posts/post-screen.tsx", 31, 34, "Missing Post delegates to framework fallback")
  ],
  "WEB-005": [
    mark("src/features/messaging/ui/inbox/member-combobox.tsx", 35, 42, "Rejected search becomes an empty array"),
    mark("src/features/messaging/ui/inbox/member-combobox.tsx", 68, 75, "Failure appears as no matching members")
  ],
  "I18N-001": [
    mark("src/shared/schemas.ts", 4, 14, "Universal schema emits English copy"),
    mark("src/features/account/login/service.ts", 33, 35, "Fallback message is an English string"),
    mark("src/shared/ui/base/dialog.tsx", 64, 64, "Used primitive hardcodes its accessible close label"),
    mark("src/shared/ui/base/toast.tsx", 105, 105, "Toast close copy bypasses app locale")
  ]
}
const step = (title, file, symbol, description, findings = []) => ({ title, file, symbol, description, findings })
const range = (title, file, line, end, description, findings = []) => ({
  title,
  file,
  line,
  end,
  description,
  findings
})
export const workflows = [
  {
    id: "native",
    title: "Native authentication",
    description: "The public auth API is an entrypoint independent of pages and Server Actions.",
    steps: [
      range(
        "Enter native HTTP",
        "src/app/api/auth/[...all]/route.ts",
        1,
        4,
        "The route publishes Better Auth GET and POST handlers. The application proxy does not govern these endpoints.",
        ["AUTH-001", "AUTHZ-001"]
      ),
      step(
        "Enable plugin endpoints",
        "src/core/auth/auth.ts",
        "authPlugins",
        "Email OTP, magic link, 2FA and Admin plugins expose separate capabilities.",
        ["AUTH-001", "AUTH-003", "AUTHZ-002"]
      ),
      step(
        "Apply shared origin trust",
        "src/core/auth/auth.ts",
        "authOptions",
        "Base URL host trust, password restrictions and cookie caching are independent settings.",
        ["AUTH-002", "AUTH-004"]
      ),
      step(
        "Dispatch an OTP",
        "src/core/email/senders/auth.ts",
        "sendVerificationOtpEmail",
        "The sender supports sign-in as well as email verification OTPs.",
        ["AUTH-001"]
      ),
      step(
        "Apply native grants",
        "src/core/auth/permissions.ts",
        "accessRoles",
        "Native global grants are broader than the app’s target-specific lifecycle rules.",
        ["AUTHZ-001", "AUTHZ-002"]
      )
    ]
  },
  {
    id: "login",
    title: "Sign in and return",
    description: "Follow credential results, 2FA and return destinations through the account workflow.",
    steps: [
      step(
        "Submit credentials",
        "src/features/account/login/login-form.tsx",
        "LoginForm",
        "Login subscribes to pending state and handles sign-in outcomes.",
        ["WEB-001", "WEB-002", "I18N-001"]
      ),
      step(
        "Choose identifier route",
        "src/features/account/login/service.ts",
        "signInWithIdentifier",
        "Choose email or username authentication."
      ),
      step(
        "Classify sign-in",
        "src/features/account/login/service.ts",
        "signInWithEmailPassword",
        "Password sign-in returns success, failure or a normal 2FA challenge.",
        ["AUTH-003", "I18N-001"]
      ),
      step(
        "Verify the challenge",
        "src/features/account/two-factor/use-two-factor-form.ts",
        "useTwoFactorForm",
        "Pending state surrounds awaited requests but rejects can skip cleanup.",
        ["WEB-003"]
      ),
      step(
        "Choose return destination",
        "src/core/navigation/navigation-utils.ts",
        "getPostLoginPath",
        "The helper returns accepted raw input without URL normalization.",
        ["WEB-001"]
      )
    ]
  },
  {
    id: "reset",
    title: "Reset a password",
    description: "A consumed reset token and an unfinished login are separate state transitions.",
    steps: [
      step(
        "Request reset email",
        "src/features/account/password-reset/service.ts",
        "requestPasswordReset",
        "The auth request carries the intended reset callback.",
        ["AUTH-002"]
      ),
      step(
        "Render and dispatch",
        "src/core/email/senders/auth.ts",
        "sendResetPasswordEmail",
        "Delivery receives the credential-bearing reset link."
      ),
      step(
        "Submit new password",
        "src/features/account/password-reset/password-reset-form.tsx",
        "PasswordResetForm",
        "The UI reads pending state directly and stays displayed after a failure result.",
        ["WEB-002", "AUTH-005"]
      ),
      step(
        "Commit before sign-in",
        "src/features/account/password-reset/service.ts",
        "resetPassword",
        "The reset succeeds before automatic sign-in can return a 2FA challenge.",
        ["AUTH-005"]
      ),
      step(
        "Preserve challenge context",
        "src/core/navigation/navigation-utils.ts",
        "twoFactorPath",
        "Existing navigation can carry available challenge methods and a safe return path.",
        ["AUTH-005", "WEB-001"]
      )
    ]
  },
  {
    id: "lifecycle",
    title: "Change a User’s authority",
    description: "Compare app-owned target rules with native alternatives and competing writers.",
    steps: [
      step(
        "Load a request actor",
        "src/core/auth/permissions.server.ts",
        "getCurrentActor",
        "Identity and roles start from getSession without cache bypass.",
        ["AUTH-004"]
      ),
      step(
        "Require an Admin",
        "src/core/auth/permissions.server.ts",
        "requireAdmin",
        "App privilege derives from the actor’s roles.",
        ["AUTH-004"]
      ),
      step(
        "Check final Admin",
        "src/features/user-management/actions.ts",
        "isLastAdmin",
        "Count active Admins before the later write.",
        ["AUTHZ-001"]
      ),
      step(
        "Change a role",
        "src/features/user-management/actions.ts",
        "changeUserRole",
        "The action checks self/target rules and then calls the native setter.",
        ["AUTHZ-001"]
      ),
      step(
        "Compare native entrypoint",
        "src/core/auth/permissions.ts",
        "accessRoles",
        "Direct native setters use broad grants, not this action’s target checks.",
        ["AUTHZ-001", "AUTHZ-002"]
      )
    ]
  },
  {
    id: "send",
    title: "Send a private Message",
    description: "Retain the transactional seam while following where session context disappears.",
    steps: [
      step(
        "Compose intent",
        "src/features/messaging/ui/conversation/message-composer.tsx",
        "MessageComposer",
        "Send text, Conversation identity and an idempotency key."
      ),
      step(
        "Adapt request outcome",
        "src/features/messaging/ui/conversation/actions.ts",
        "sendMessageAction",
        "Translate module results and revalidate; unexpected failures lose diagnostics.",
        ["OPS-003"]
      ),
      step(
        "Resolve effective identity",
        "src/core/auth/session.server.ts",
        "requireAuthenticatedUser",
        "Return a User ID without the session’s impersonation context.",
        ["AUTH-004", "AUTHZ-002"]
      ),
      step(
        "Enter the command",
        "src/features/messaging/sending/send-message.ts",
        "sendMessage",
        "Membership and recipient checks do not restore the discarded actor context.",
        ["AUTHZ-002", "AUTH-004"]
      ),
      step(
        "Serialize and persist",
        "src/features/messaging/sending/append-message.ts",
        "appendMessage",
        "Sender/key and Conversation locks preserve sequence and exact-intent retries."
      ),
      step(
        "Contrast route restriction",
        "src/core/auth/route-access.ts",
        "getRouteAccessDecision",
        "Route rejection exists, but the command must independently enforce the same rule.",
        ["AUTHZ-002", "OPS-003", "WEB-004"]
      )
    ]
  },
  {
    id: "binding",
    title: "Bind this browser to a User",
    description: "Browser subscription existence and application ownership are distinct facts.",
    steps: [
      step(
        "Read browser subscription",
        "src/features/account/settings/notifications/push-notification-settings.tsx",
        "PushNotificationSettings",
        "The settings screen treats a browser subscription object as Enabled.",
        ["NOTIFY-03"]
      ),
      step(
        "Accept subscription input",
        "src/features/account/settings/notifications/push-notification-actions.ts",
        "subscribeUserToPush",
        "The authenticated action accepts a TypeScript-only subscription shape.",
        ["NOTIFY-01"]
      ),
      step(
        "Store endpoint ownership",
        "src/core/notifications/subscription.ts",
        "subscribe",
        "The endpoint is bound to the effective User on the server.",
        ["NOTIFY-01", "NOTIFY-03"]
      ),
      range(
        "Sign out separately",
        "src/core/navigation/logout-button.tsx",
        14,
        22,
        "Sign-out does not reconcile the browser’s push binding.",
        ["NOTIFY-03"]
      ),
      range(
        "Display a received push",
        "public/service-worker.js",
        1,
        11,
        "The service worker displays the payload without a current app login.",
        ["NOTIFY-02", "NOTIFY-03"]
      )
    ]
  },
  {
    id: "delivery",
    title: "Broadcast a notification",
    description: "Follow recipient selection, provider acceptance and bookkeeping as separate boundaries.",
    steps: [
      step(
        "Authorize the broadcast",
        "src/features/notification-broadcast/actions.ts",
        "sendTestNotificationToAll",
        "Require an Admin before passing a trimmed message."
      ),
      step(
        "Select device rows",
        "src/core/notifications/send-push-notification.ts",
        "sendToAll",
        "Active transport status is checked, User activity is not.",
        ["NOTIFY-02"]
      ),
      step(
        "Reach the provider",
        "src/core/notifications/send-push-notification.ts",
        "sendToSubscriptions",
        "Stored endpoints control the transport destination; no timeout is supplied.",
        ["NOTIFY-01", "NOTIFY-04"]
      ),
      step(
        "Compare recipient picker",
        "src/core/notifications/subscription.ts",
        "listUsersWithActiveSubscriptions",
        "The picker uses the same incomplete notion of eligibility.",
        ["NOTIFY-02"]
      ),
      range(
        "Receive without a session",
        "public/service-worker.js",
        1,
        11,
        "Provider handoff cannot be recalled by later application logout.",
        ["NOTIFY-02", "NOTIFY-03"]
      )
    ]
  },
  {
    id: "deployment",
    title: "Load deployment configuration",
    description: "Environment precedence, TLS mode and email behavior meet at startup.",
    steps: [
      step(
        "Validate environment",
        "src/core/config/env.ts",
        "envSchema",
        "Blank optional strings still reach their validators; local push fields remain required.",
        ["OPS-002"]
      ),
      step(
        "Classify production",
        "src/core/config/env.ts",
        "isProduction",
        "Production behavior checks VERCEL_ENV instead of the resolved environment.",
        ["OPS-002"]
      ),
      step(
        "Rewrite database URL",
        "src/core/db/index.ts",
        "databaseUrl",
        "sslmode is forced to no certificate verification.",
        ["OPS-001", "TOOL-001", "ARCH-001"]
      ),
      step(
        "Select email transport",
        "src/core/email/client.ts",
        "createEmailClient",
        "The default log mode can remain in production.",
        ["OPS-002"]
      ),
      step(
        "Load auth configuration",
        "src/core/auth/auth.ts",
        "authOptions",
        "The mode controls verification and secure-cookie behavior.",
        ["OPS-002", "AUTH-002"]
      )
    ]
  },
  {
    id: "recovery",
    title: "Recover a client operation",
    description: "Separate pending, transport rejection and authoritative setting state.",
    steps: [
      step(
        "Start a security change",
        "src/features/account/settings/security/two-factor/use-two-factor-settings.ts",
        "useTwoFactorSettings",
        "The hook owns pending and the local setting state.",
        ["WEB-003"]
      ),
      step(
        "Await the adapter",
        "src/features/account/settings/security/two-factor/two-factor-service.ts",
        "enableTwoFactor",
        "Raw transport rejections propagate; a response can be lost after a commit.",
        ["WEB-003"]
      ),
      step(
        "Compare sign-in challenge",
        "src/features/account/two-factor/use-two-factor-form.ts",
        "useTwoFactorForm",
        "Cleanup only after await can leave controls stuck.",
        ["WEB-003"]
      ),
      step(
        "Inspect member search",
        "src/features/messaging/ui/inbox/member-combobox.tsx",
        "MemberCombobox",
        "A failed request becomes an empty result despite preserved latest-request protection.",
        ["WEB-005"]
      )
    ]
  }
]
const scenario = (id, title, description, ids, workflow) => ({
  id,
  title,
  description,
  findings: ids.split(" "),
  finding: ids.split(" ")[0],
  workflow
})
export const scenarios = [
  scenario(
    "registration",
    "Invite-only registration",
    "Compare a public OTP endpoint with the app’s visible Invite workflow.",
    "AUTH-001 AUTH-003",
    "native"
  ),
  scenario(
    "origins",
    "Reset callback trust",
    "Select a callback host and inspect where the reset credential would go.",
    "AUTH-002",
    "reset"
  ),
  scenario(
    "alternate",
    "2FA entrypoints",
    "Choose a sign-in mechanism for an existing User with 2FA enabled.",
    "AUTH-003",
    "login"
  ),
  scenario(
    "cache",
    "Revoked session cache",
    "Advance cache time after session removal or role demotion.",
    "AUTH-004",
    "lifecycle"
  ),
  scenario(
    "reset",
    "Reset completion",
    "Change the post-reset sign-in outcome after the token has been consumed.",
    "AUTH-005",
    "reset"
  ),
  scenario(
    "admins",
    "Final-Admin race",
    "Advance two lifecycle writes across a separate count and mutation.",
    "AUTHZ-001",
    "lifecycle"
  ),
  scenario(
    "actor",
    "Impersonation boundaries",
    "Compare route checks with direct commands and credential entrypoints.",
    "AUTHZ-002",
    "send"
  ),
  scenario(
    "guards",
    "Sensitive import seam",
    "Follow a hypothetical client import into real unpoisoned server leaves.",
    "ARCH-001",
    "deployment"
  ),
  scenario(
    "tls",
    "Database TLS mode",
    "Choose a requested SSL mode and inspect the actual rewritten client configuration.",
    "OPS-001",
    "deployment"
  ),
  scenario(
    "environment",
    "Production classification",
    "Change ENVIRONMENT and VERCEL_ENV independently.",
    "OPS-002",
    "deployment"
  ),
  scenario(
    "errors",
    "Denied or unavailable",
    "Inject a modeled permission check failure and compare outcomes and diagnostics.",
    "OPS-003 WEB-004",
    "send"
  ),
  scenario(
    "packages",
    "Runtime dependency graph",
    "Explore how a clean runtime install differs from a development dependency tree.",
    "TOOL-001",
    "deployment"
  ),
  scenario(
    "docs",
    "Documentation drift",
    "Compare historical entry-map statements with concrete route source.",
    "DOC-001",
    "send"
  ),
  scenario(
    "endpoint",
    "Push destination",
    "Inspect URL parsing and a proposed destination policy without making any request.",
    "NOTIFY-01",
    "delivery"
  ),
  scenario(
    "audience",
    "Push eligibility",
    "Toggle User activity and device health to inspect recipient selection.",
    "NOTIFY-02",
    "delivery"
  ),
  scenario(
    "binding",
    "Shared-browser push binding",
    "Switch login identity while keeping the browser subscription and server binding.",
    "NOTIFY-03",
    "binding"
  ),
  scenario(
    "delivery",
    "Provider and bookkeeping",
    "Change provider outcome and the metadata write independently.",
    "NOTIFY-04",
    "delivery"
  ),
  scenario(
    "return",
    "Return-path normalization",
    "Try raw and control-character paths against the source predicate and URL parser.",
    "WEB-001",
    "login"
  ),
  scenario(
    "pending",
    "Unsubscribed pending state",
    "Advance a slow form request, rerender and repeated submit.",
    "WEB-002",
    "reset"
  ),
  scenario(
    "transport",
    "Lost response recovery",
    "Choose failure before a write or lost acknowledgement after a committed write.",
    "WEB-003",
    "recovery"
  ),
  scenario(
    "search",
    "Failed member search",
    "Separate rejected requests, empty results and stale completions.",
    "WEB-005",
    "recovery"
  ),
  scenario(
    "locale",
    "Locale at the presentation edge",
    "Change the app locale and inspect hardcoded versus translated failure contracts.",
    "I18N-001",
    "login"
  )
]
