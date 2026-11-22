---
status: proposed
---

# The Board schedules Choir rehearsals

Admins and current Position holders in an active Board group may manage a Rehearsal in a Series
whose only Target is one whole Choir, through the `event.scheduleRehearsals` policy. This is an
exception to the rule that Choir-organised Events are Admin-only: the Board sets up and adjusts
each Choir's weekly rehearsals for a term, and an Admin need not do it for them.

The grant follows the Event's type, Series and Targets, not its organiser. Generated Rehearsals
keep the Choir as Organiser group, so who the Rehearsal belongs to does not change when a new
Board takes over on 1 July. A Board update must leave the Event a Choir's Series Rehearsal under
the same organiser; otherwise it needs authority over the proposed organiser as before. Extra
and Sectional rehearsals, and Rehearsals for several Choirs, stay outside the grant.

## Consequences

Event policy contexts carry the Group catalogue and the Event's Targets, and Event operations
lock the actor's Board groups with the organisers. The rehearsal schedule tool lives at
`/events/manage/rehearsals`, since `/admin` admits only Admins. Conductors managing their own
Choir's Rehearsals is a separate decision, tracked in issue #168. This draft records the
design discussion, not team approval.
