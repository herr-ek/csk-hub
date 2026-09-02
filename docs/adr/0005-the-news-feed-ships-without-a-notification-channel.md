# The news feed ships without a notification channel

Publishing a Post sends nothing. No email, no push, no notification of any kind. A Member
learns that something was posted by opening the Hub and seeing an unread badge.

This was chosen deliberately and against the obvious objection. The feed was conceived to
replace the monthly email, and an earlier plan had each Post optionally mailed to the
membership through the existing `sendEmail` abstraction. That was dropped: the choice
between a batched digest and web push is a real design problem — deliverability, opt-out,
scheduling, PWA install rates — and answering it as a checkbox on the publish form would
have settled it by accident. It is now its own milestone.

## Consequences

The monthly email keeps running exactly as before. The feed does not replace it yet; it
runs alongside as the place information is published, and the milestone's goal is stated
that way. Posts have permalinks partly so an Admin can paste one into that email, which
is the only bridge between the two channels until notifications exist.

The unread indicator is therefore load-bearing rather than a nicety. It is the sole
mechanism by which anyone discovers a Post, which is why a single `lastSeenAt` per Member
is part of the milestone rather than deferred with the rest of the read-state questions.

The risk we are accepting: an information channel nobody is told about is one nobody
reads. This is affordable only because the Hub is not yet in real use. Once it is, a feed
without notifications is not an incomplete feature but a broken one — the Notifications
milestone is a prerequisite for depending on the Hub, not an enhancement to it.

A news feed that notifies nobody reads as an oversight in the code. It is not.
