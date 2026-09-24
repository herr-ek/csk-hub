# Message idempotency is per sender

A Message idempotency key is unique for its author across all Conversations and identifies
one exact send intent: the target Conversation and normalized Message body. Retrying that
intent returns the original Message. Reusing its key with a different Conversation or body
is rejected rather than silently treating the different intent as successful.

## Consequences

The database enforces the rule with a unique `(author_user_id, idempotency_key)` index,
while commands take a transaction-scoped sender/key lock before locking the Conversation
and re-reading the key. Concurrent retries therefore converge on the original Message,
including when conflicting requests target different Conversations, instead of surfacing
a unique-key failure.

Clients must generate a fresh UUID for each intended send, retain it while retrying that
send, and replace it only after success. A key submitted with a different intent fails with
`idempotency-key-reused`; the client may then retry that distinct intent with a new key.
