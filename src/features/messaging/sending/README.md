# Sending Messages

`sending` is the server-only module that turns an authenticated send intent into one durable
Message. Its interface has two commands; callers never need to know about database locks,
sequences, retries, or read cursors.

## Interface

Callers import only from `@/features/messaging/sending`:

```ts
sendMessage({ conversationId, text, idempotencyKey })
startDirectConversation({ recipientId, text, idempotencyKey })
```

Both commands derive the sender from the authenticated request. Callers supply identifiers and
untrusted form values, never a sender identity or a database transaction. A successful command
returns the persisted Message identity, its Conversation and sequence, plus whether this request
created it. Expected user-safe failures are `MessagingAccessError`s; UI adapters translate them
into localized command state.

`index.ts` is the module seam. The remaining files are implementation:

- `send-message.ts` sends to an existing Direct Conversation.
- `start-direct-conversation.ts` finds or creates a Direct Conversation and sends its first Message.
- `direct-recipient.ts` authorizes membership and locks the other User while checking availability.
- `append-message.ts` provides the common atomic persistence operation.

## Read this first

There are only two kinds of send:

```text
new Direct Conversation → find or create the pair → appendMessage
existing Conversation    → check membership           → appendMessage
```

`appendMessage` is the persistence seam. It owns the database mechanics so neither command can
forget ordering, retry handling, or the read-cursor update.

## Why PostgreSQL appears here

| Mechanism | Product rule it protects |
| --- | --- |
| Direct-pair unique index and lock | Two Users share one Direct Conversation, even if both press Send simultaneously. |
| Conversation row lock and `next_message_sequence` | Messages in one Conversation receive a stable, contiguous order. |
| Sender/key lock and unique index | Retrying one send does not create a second Message. |
| Transaction | A Message and its sender's read position change together, or neither changes. |

The locks are narrow: a send only waits for the same pair, the same Conversation, or the same
retry key. They do not lock the message table or block unrelated Conversations.

## Existing Conversation flow

1. Resolve the authenticated User and validate the Message body and idempotency key.
2. Begin a database transaction.
3. Resolve Direct Conversation membership and lock the other User's row. The row lock keeps an
   account deactivation from racing the send.
4. Hand the validated intent to `appendMessage`.
5. Return the existing Message for an exact retry, or reject a key reused with different content or
   a different Conversation.
6. Allocate the next sequence, insert the Message, and advance the sender's read cursor.
7. Commit all writes together.

## New Direct Conversation flow

The command first locks and validates the intended recipient. Member IDs are sorted into a stable
pair, and a transaction-scoped PostgreSQL advisory lock serializes first sends for that pair. The
command then reuses the existing Direct Conversation or creates the Conversation, pair record, and
both read cursors before calling `appendMessage`.

The advisory lock and the database's unique member-pair index work together: the lock provides a
predictable application flow, while the unique index remains the final invariant.

## Atomic append and ordering

`appendMessage` assumes its caller has already established that the sender may write to the
Conversation. It owns the persistence guarantees shared by every sending workflow:

- The Conversation row is locked with `FOR UPDATE`, serializing appends to that Conversation without
  blocking unrelated Conversations.
- A transaction-scoped advisory lock derived from the sender and key serializes retries even when
  concurrent requests target different Conversations.
- `conversation.next_message_sequence` is incremented and returned in constant time. No Message
  scan is needed, and committed sequences stay contiguous.
- Message insertion and the sender's `conversation_read_state` update occur in the same transaction.
  A failure in either rolls back both.
- Only a newly created Message advances the read cursor. An idempotent retry returns the original
  result without allocating another sequence.

The database also enforces unique `(conversation_id, sequence)` values and unique
`(author_user_id, idempotency_key)` values. See
[`src/core/db/schema/messaging.ts`](../../../core/db/schema/messaging.ts).

## Idempotency contract

An idempotency key identifies one intended Message for one sender across all Conversations. The UI
creates a UUID when a composer starts an intent, retains it across failed or repeated submissions,
and replaces it only after a successful send. The server treats the key as untrusted input and
requires it to be non-blank.

After locking the sender/key pair and the Conversation, `appendMessage` looks up
`(author_user_id, idempotency_key)`:

- same Conversation and same normalized Message body: return the original Message;
- different Conversation or body: raise `idempotency-key-reused`;
- no match: allocate a sequence and insert the Message.

The database unique index is the final protection against duplicate persisted keys. The policy's
original rationale is recorded in
[`ADR 0005`](../../../../docs/adr/0005-message-idempotency-is-per-sender.md).

## Error and retry behavior

Validation and access failures use stable `MessagingErrorKind` values from `model/messaging-error.ts`.
Unexpected database and programming errors are not converted here; they propagate so the UI adapter
can present a generic failure while server observability retains the original error.

Server Actions are transport adapters. They enforce request-context availability rules such as the
support-impersonation restriction, parse `FormData`, call this module, invalidate affected routes,
and translate errors. They must not duplicate sender, Conversation, recipient, or transaction
behavior owned here.

## Tests

Command tests protect authentication and authorization outcomes. Focused append tests protect the
transaction invariants that are otherwise difficult to observe independently: retry recognition,
key-reuse rejection, sequence allocation, and cursor advancement. Keep tests beside this module so
implementation changes and their verification remain local.
