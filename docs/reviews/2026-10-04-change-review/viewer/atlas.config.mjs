// Presentation metadata. Findings themselves are read from the canonical review.
export const base = "b5fd804b7c840bf76a45afe4667d2507d01b9b0d"
export const head = "031da8f8d6a9162834b1697ffb3f53bf0e4acd56"
export const modules = [
  {
    id: "app",
    name: "Routes",
    path: "src/app",
    layer: "entry",
    x: 55,
    y: 55,
    description: "Locale-aware pages and proxy routing. Routes compose feature entrypoints.",
    entry: "src/proxy.ts"
  },
  {
    id: "account",
    name: "Account",
    path: "src/features/account",
    layer: "feature",
    x: 295,
    y: 55,
    description: "Activation, sign-in, recovery and personal settings.",
    entry: "src/features/account/index.ts"
  },
  {
    id: "users",
    name: "User management",
    path: "src/features/user-management",
    layer: "feature",
    x: 535,
    y: 55,
    description: "Admin invitations, imports, account lifecycle and impersonation.",
    entry: "src/features/user-management/index.ts"
  },
  {
    id: "posts",
    name: "Posts",
    path: "src/features/posts",
    layer: "feature",
    x: 775,
    y: 55,
    description: "Publishing announcements and reading the News feed.",
    entry: "src/features/posts/post-document.ts"
  },
  {
    id: "auth",
    name: "Authentication",
    path: "src/core/auth",
    layer: "core",
    x: 55,
    y: 220,
    description: "Better Auth identity, coarse grants, request actors and route policy.",
    entry: "src/core/auth/session.server.ts"
  },
  {
    id: "messaging",
    name: "Messaging",
    path: "src/features/messaging",
    layer: "feature",
    x: 295,
    y: 220,
    description: "Private Direct Conversations, transactional sends and unread cursors.",
    entry: "src/features/messaging/sending/send-message.ts"
  },
  {
    id: "org",
    name: "Org structure",
    path: "src/features/org-structure",
    layer: "feature",
    x: 535,
    y: 220,
    description: "Groups, dated Memberships and Position holders. Commands own the invariants.",
    entry: "src/features/org-structure/positions.ts"
  },
  {
    id: "richtext",
    name: "Rich text",
    path: "src/features/rich-text",
    layer: "feature",
    x: 775,
    y: 220,
    description: "One document vocabulary, browser editor and server reader.",
    entry: "src/features/rich-text/view/rich-text-content.tsx"
  },
  {
    id: "shell",
    name: "App infrastructure",
    path: "src/core",
    layer: "core",
    x: 55,
    y: 430,
    description: "Locale, navigation, preferences, theme, logging, configuration and adapters.",
    entry: "src/core/i18n/locale-switcher.tsx"
  },
  {
    id: "db",
    name: "Database",
    path: "src/core/db",
    layer: "core",
    x: 295,
    y: 430,
    description: "PostgreSQL client and schema ownership. Feature modules own application writes.",
    entry: "src/core/db/schema/org-structure.ts"
  },
  {
    id: "voice",
    name: "Voice",
    path: "src/features/voice",
    layer: "feature",
    x: 535,
    y: 385,
    description: "Universal Voice containment plus singer capabilities.",
    entry: "src/features/voice/model/voice.ts"
  },
  {
    id: "shared",
    name: "Shared presentation",
    path: "src/shared",
    layer: "shared",
    x: 775,
    y: 430,
    description: "UI primitives, generic forms and universal helpers.",
    entry: "src/shared/forms/fields.tsx"
  },
  {
    id: "ops",
    name: "Operational tooling",
    path: "scripts",
    layer: "ops",
    x: 535,
    y: 550,
    description: "Guarded database targets, bootstrap/reference data and local demo seeds.",
    entry: "scripts/ops/reference-data.ts"
  }
]
export const annotations = {
  "STD-1": [
    {
      file: "scripts/ops/reference-data.ts",
      from: 109,
      to: 113,
      label: "Mutable names decide whether to create a Section"
    },
    {
      file: "src/features/org-structure/structure.ts",
      from: 93,
      to: 100,
      label: "Renaming is an ordinary supported operation"
    }
  ],
  "STD-2": [
    {
      file: "src/features/org-structure/positions.ts",
      from: 90,
      to: 104,
      label: "Overlap check only considers the incoming person"
    }
  ],
  "STD-3": [
    {
      file: "src/features/org-structure/positions.ts",
      from: 65,
      to: 72,
      label: "Allowance read without a coordinating lock"
    },
    {
      file: "src/features/org-structure/structure.ts",
      from: 176,
      to: 203,
      label: "Revocation uses a Position lock that assignment does not take"
    }
  ],
  "STD-4": [
    {
      file: "src/features/org-structure/positions.ts",
      from: 42,
      to: 58,
      label: "Holder row first, then User advisory locks"
    },
    {
      file: "src/features/org-structure/membership.ts",
      from: 120,
      to: 139,
      label: "User lock first, then holder updates"
    }
  ],
  "SPEC-01": [
    {
      file: "src/features/rich-text/view/rich-text-content.tsx",
      from: 76,
      to: 84,
      label: "Ordered list start is not rendered"
    },
    {
      file: "src/features/rich-text/document/features.ts",
      from: 38,
      to: 45,
      label: "The editor uses the ordered-list extension"
    }
  ],
  "SPEC-02": [
    {
      file: "src/features/org-structure/ui/detail/positions-section.tsx",
      from: 110,
      to: 134,
      label: "Confirmation describes the page-loaded holder"
    },
    {
      file: "src/features/org-structure/ui/detail/actions.ts",
      from: 80,
      to: 99,
      label: "No expected holder travels with the command"
    },
    { file: "src/features/org-structure/positions.ts", from: 42, to: 58, label: "The actual current holder is ended" }
  ],
  "PROD-1": [
    {
      file: "src/core/auth/session.server.ts",
      from: 20,
      to: 28,
      label: "Identity is accepted from a potentially cached session"
    },
    {
      file: "src/features/messaging/sending/direct-recipient.ts",
      from: 48,
      to: 61,
      label: "Only the other User is checked for activity"
    },
    { file: "src/core/auth/auth.ts", from: 71, to: 76, label: "Cookie caching remains enabled" },
    {
      file: "src/features/messaging/sending/send-message.ts",
      from: 12,
      to: 27,
      label: "Sender identity reaches persistence without an activity check"
    }
  ],
  "PROD-2": [
    {
      file: "src/features/messaging/ui/conversation/query.ts",
      from: 40,
      to: 45,
      label: "The old window excludes newly sent Messages"
    },
    {
      file: "src/features/messaging/ui/conversation/message-composer.tsx",
      from: 24,
      to: 28,
      label: "Success scrolls the existing window without changing its cursor"
    }
  ],
  "PROD-3": [
    {
      file: "src/features/messaging/ui/message-command-result.ts",
      from: 8,
      to: 18,
      label: "Unexpected error is converted without logging"
    },
    {
      file: "src/features/messaging/ui/conversation/actions.ts",
      from: 26,
      to: 31,
      label: "The catch returns a generic state"
    }
  ]
}
const step = (title, file, symbol, description, findings = []) => ({ title, file, symbol, description, findings })
export const workflows = [
  {
    id: "send",
    title: "Send a Message",
    group: "Messaging",
    description: "From a member’s composer to one durable Message and its read cursor.",
    steps: [
      step(
        "Compose intent",
        "src/features/messaging/ui/conversation/message-composer.tsx",
        "MessageComposer",
        "The form sends text, Conversation identity and a retry key."
      ),
      step(
        "Adapt the request",
        "src/features/messaging/ui/conversation/actions.ts",
        "sendMessageAction",
        "Block support impersonation, invoke the command, revalidate and translate failures.",
        ["PROD-2", "PROD-3"]
      ),
      step(
        "Resolve identity",
        "src/core/auth/session.server.ts",
        "requireAuthenticatedUser",
        "A session establishes sender identity; the current guard can trust cached data.",
        ["PROD-1"]
      ),
      step(
        "Authorize the pair",
        "src/features/messaging/sending/direct-recipient.ts",
        "resolveActiveDirectCounterpart",
        "Require Direct Conversation membership and check the recipient while holding a shared User row lock.",
        ["PROD-1"]
      ),
      step(
        "Serialize one send",
        "src/features/messaging/sending/append-message.ts",
        "appendMessage",
        "Lock the sender/key and Conversation, recognize exact retries, allocate a sequence, insert and advance the sender’s cursor."
      ),
      step(
        "Persist constraints",
        "src/core/db/schema/messaging.ts",
        "message",
        "Database indexes protect sequence and sender/idempotency-key uniqueness."
      )
    ]
  },
  {
    id: "holder",
    title: "Replace a Position holder",
    group: "Groups",
    description: "Follow the point where UI confirmation becomes a dated handover.",
    steps: [
      step(
        "Confirm the handover",
        "src/features/org-structure/ui/detail/positions-section.tsx",
        "AssignHolderDialog",
        "The dialog describes the holder known when the page loaded.",
        ["SPEC-02"]
      ),
      step(
        "Parse the command",
        "src/features/org-structure/ui/detail/actions.ts",
        "assignHolderAction",
        "Identifiers and start date travel to replacement; expected holder state does not.",
        ["SPEC-02"]
      ),
      step(
        "Require an Admin",
        "src/features/org-structure/ui/run-command.ts",
        "runGroupCommand",
        "Server enforcement precedes validation and persistence."
      ),
      step(
        "Lock the incumbent",
        "src/features/org-structure/positions.ts",
        "replacePositionHolder",
        "Lock the current holder row, then acquire User advisory locks and close the old holding.",
        ["STD-4", "SPEC-02"]
      ),
      step(
        "Validate the office",
        "src/features/org-structure/positions.ts",
        "addHolding",
        "Check allowed Group type, current Membership and dates before insertion.",
        ["STD-2", "STD-3"]
      ),
      step(
        "Translate the result",
        "src/features/org-structure/ui/command-dialog.tsx",
        "CommandDialog",
        "Typed module refusals are presented inline; success closes the dialog."
      )
    ]
  },
  {
    id: "voice",
    title: "Change a singer’s Voice",
    group: "Groups",
    description: "Keep membership history while choosing the Section whose Voice contains the singer’s.",
    steps: [
      step(
        "Choose Voice and date",
        "src/features/org-structure/ui/detail/members-section.tsx",
        "MembersSection",
        "Current Section members can change Voice using the detail workflow."
      ),
      step(
        "Resolve the Choir",
        "src/features/org-structure/ui/detail/actions.ts",
        "changeVoiceAction",
        "Look up the Choir from the current Group and pass the change to the module."
      ),
      step(
        "Close and open periods",
        "src/features/org-structure/membership.ts",
        "changeVoice",
        "Lock the User; end the old Section Membership and create a new row. Changing Section also ends local Positions."
      ),
      step(
        "Apply containment",
        "src/features/voice/model/voice.ts",
        "contains",
        "A family contains its divisions; a division contains itself."
      )
    ]
  },
  {
    id: "publish",
    title: "Publish a rich-text Post",
    group: "Posts",
    description: "Editor JSON crosses a normalization boundary, then becomes server-rendered prose.",
    steps: [
      step(
        "Author the document",
        "src/features/rich-text/editor/rich-text-editor.tsx",
        "RichTextEditor",
        "The browser editor writes JSON to the form’s hidden field."
      ),
      step(
        "Validate and authorize",
        "src/features/posts/compose/actions.ts",
        "publishPost",
        "Normalize against the Post schema, then require Post creation permission."
      ),
      step(
        "Normalize vocabulary",
        "src/features/rich-text/document/document-schema.ts",
        "createDocumentSchema",
        "Prune unknown nodes/marks, unsafe destinations and unsupported attributes."
      ),
      step(
        "Store one document",
        "src/core/db/schema/posts.ts",
        "post",
        "JSONB remains the source of the words; PostgreSQL derives search lexemes."
      ),
      step(
        "Render on the server",
        "src/features/rich-text/view/rich-text-content.tsx",
        "RichTextContent",
        "React node mappings render text safely. The ordered-list mapping currently loses its start attribute.",
        ["SPEC-01"]
      )
    ]
  },
  {
    id: "reference",
    title: "Rename and reseed a Section",
    group: "Operations",
    description: "Explore why an application-safe rename breaks the operational bootstrap assumption.",
    steps: [
      step(
        "Rename the Group",
        "src/features/org-structure/structure.ts",
        "renameGroup",
        "An Admin can change an active Group’s display name."
      ),
      step(
        "Run reference data",
        "scripts/ops/reference-data.ts",
        "insertReferenceData",
        "Reference entities are matched by active name. A renamed Section appears to be missing.",
        ["STD-1"]
      ),
      step(
        "Create the missing name",
        "scripts/ops/reference-data.ts",
        "activeGroupId",
        "The original name is recreated with the same Voice, leaving a fifth Section.",
        ["STD-1"]
      ),
      step(
        "Place a singer",
        "src/features/org-structure/membership.ts",
        "sectionSinging",
        "Voice-based placement assumes Sections do not overlap. The seed has broken that assumption."
      )
    ]
  }
]
export const scenarios = [
  {
    id: "cache",
    title: "Session cache",
    description:
      "Move time forward after an account is deactivated. Compare cached identity with an authoritative check.",
    finding: "PROD-1",
    workflow: "send"
  },
  {
    id: "deadlock",
    title: "Competing handovers",
    description: "Advance two transactions until each waits on a lock held by the other.",
    finding: "STD-4",
    workflow: "holder"
  },
  {
    id: "periods",
    title: "Historical holders",
    description:
      "Move the new start date across the previous holder’s period and inspect which rule the code actually checks.",
    finding: "STD-2",
    workflow: "holder"
  },
  {
    id: "confirmation",
    title: "Stale confirmation",
    description: "Change the database holder after an Admin opens the dialog, then submit the old page.",
    finding: "SPEC-02",
    workflow: "holder"
  },
  {
    id: "numbering",
    title: "Published numbering",
    description: "Choose a list’s starting number and compare the editor document with the server reader.",
    finding: "SPEC-01",
    workflow: "publish"
  },
  {
    id: "pagination",
    title: "Sending from history",
    description: "Choose a timeline window and append a Message. Revalidation keeps the same query cursor.",
    finding: "PROD-2",
    workflow: "send"
  },
  {
    id: "allowance",
    title: "Catalogue race",
    description: "Interleave allowance revocation and holder assignment across their validation and commit points.",
    finding: "STD-3",
    workflow: "holder"
  },
  {
    id: "reseed",
    title: "Rename and reseed",
    description:
      "Rename a reference Section, rerun bootstrap, and compare identity by name with identity by Choir and Voice.",
    finding: "STD-1",
    workflow: "reference"
  }
]
