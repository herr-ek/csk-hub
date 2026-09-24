# Messaging

Messaging is a feature module for private Conversations and Messages. Domain terminology and
product rules live in [`CONTEXT.md`](../../../CONTEXT.md#messaging); this document explains where
the implementation lives and how its parts depend on one another.

## Structure

```text
messaging/
  index.ts       public screen entrypoint used by routes
  model/         small, universal messaging rules and validation
  sending/       server-only module that owns all Message-send behavior
  ui/            screens, screen-shaped reads, Server Actions, and client interaction
```

Dependencies point from `ui` into `sending` and `model`. `sending` may use `model` and core
infrastructure. `model` stays independent of React, Next.js, and the database.

Routes import screens only through `@/features/messaging`. UI Server Actions call the public
`sending` interface rather than its implementation files. Code outside `sending` must not call
`append-message.ts` or `direct-recipient.ts` directly.

## Where changes belong

- Change sender authentication, Conversation authorization, idempotency, transaction ordering, or
  Message persistence in `sending/`. Request-context availability rules, such as preventing sends
  during support impersonation, belong at the Server Action boundary in `ui/`. Read
  [`sending/README.md`](sending/README.md) before changing that module.
- Change shared Message body rules or pure Direct Conversation rules in `model/`.
- Change rendering, form behavior, navigation, or cache revalidation in `ui/`.
- Keep reads shaped for a screen beside that screen. For example, the inbox query returns the inbox
  view model; it is not part of the sending interface.
- Keep Next.js route files thin and import the feature through `index.ts`.

The `ui/conversation/` name follows the domain language. “Thread” and “chat” are intentionally not
used as synonyms for Conversation.
