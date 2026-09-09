---
status: proposed
---

# Messaging erasure anonymizes authorship while preserving shared conversations

Messaging must honour Erasure without destroying shared correspondence. On Erasure,
delete the Member's Conversation Memberships and remove all Better Auth identity links
from their retained Messages and Conversation metadata; retain Message text and sequence
for remaining Members. This requires nullable, `ON DELETE SET NULL` author and creator
references rather than cascading a Better Auth user deletion into shared Conversation
data.

## Consequences

The normal soft-delete capability remains separate from Erasure. A retained Message
whose author is erased displays “Former member” and contains no profile link or retained
author name; its sequence remains continuous. A dedicated erasure workflow must detach
these references before deleting the Better Auth user; until it exists, account erasure
must refuse Members with messaging data rather than fail a foreign-key constraint.
