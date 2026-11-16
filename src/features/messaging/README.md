# Messaging

Messaging is a feature module for private Conversations and Messages. Domain terminology and
product rules live in [`GLOSSARY.md`](../../../GLOSSARY.md#messaging); this document explains where
the implementation lives and how its parts depend on one another.

## Structure

```text
messaging/
  index.ts       public screen entrypoint used by routes
  model/         small, universal messaging rules and validation
  group-conversations/  creation, additions, renaming, departure, and group write authorization
  sending/       server-only module that owns all Message-send behavior
  reading/       shared read-only Direct Conversation lookup
  unread/        the count of Conversations with unread Messages, shown on the navigation
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
- `reading/` provides the active-pair lookup used when opening messaging from a profile.
  An existing Direct Conversation opens directly; otherwise the shared conversation dialog opens
  with that member selected. Looking up a destination creates neither a Conversation nor a Message.
- Keep Next.js route files thin and import the feature through `index.ts`.

The `ui/conversation/` name follows the domain language. “Thread” and “chat” are intentionally not
used as synonyms for Conversation.


## Group Conversations

Active members can add or re-add Users and rename the Conversation. The creator's identity is
attribution, not an ownership role. Membership changes and sends serialize on the Conversation row;
departure stores the last visible Message sequence. Group timeline reads and read-marker updates
hold a shared lock on the viewer's membership row to keep the departure cutoff stable without
contending with sends on the Conversation row. Direct reads do not lock the Conversation row.
Inbox queries apply the departure cutoff to both previews and unread counts. Former members
receive the current name and their retained Messages, but no current member list.

Creation needs no Message. Joining or rejoining initializes the read cursor through existing
history; adding an already active member preserves their cursor. Empty groups remain retained,
with no former member able to reactivate them. The UI uses the same update behavior as Direct
Conversations; no polling, conversation subscriptions, or push delivery is introduced. The
navigation's Messages badge counts Conversations with unread Messages; it updates when the User
reads a Conversation and when they return to the app, not as Messages arrive.

Creation and addition requests accept at most 100 submitted member IDs, including duplicates
and blanks, before normalization or opening a transaction. The creator is included automatically
on creation. This bounds each membership operation, rather than the total size of a Conversation.
User validation locks a batch in ID order; membership and read-cursor writes use bulk inserts,
with read cursors initialized only for new or rejoined members.

Group creation requires an idempotency key scoped to the authenticated creator. Both creation
forms retain their key across retries and generate a new key when the name or selected members
change. A creator/key advisory lock serializes simultaneous submissions, and a database unique
index prevents duplicate persisted intents. The original normalized name and sorted, deduplicated
member IDs are hashed when the group is created. An exact retry returns the original Conversation;
reusing the key with different details raises `idempotency-key-reused`. Renaming, membership changes
and departure do not change that original fingerprint or cause a retry to reset group state.
Groups created before this contract have no creation key or fingerprint.
