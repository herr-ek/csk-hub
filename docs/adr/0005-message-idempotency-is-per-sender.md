# Message idempotency is per sender

A Message idempotency key is unique for its author across all Conversations. A retry
therefore returns the original Message even if the client no longer knows which
Conversation creation or send request completed first.

## Consequences

The database enforces the rule with a unique `(author_user_id, idempotency_key)` index,
and commands re-read the key after taking the relevant transaction lock. This makes
concurrent retries converge on the original Message instead of surfacing a unique-key
failure.

Clients must generate a fresh UUID for each intended send. Reusing a key for a distinct
intentional Message returns the earlier result, which is safer than sending an
unintentional duplicate.
