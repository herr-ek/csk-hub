# Who can access Posts?

This guide describes the Member-facing rules. All permissions require an active,
signed-in Member. Being able to do something yesterday does not grant permission today.
The implementation lives in `post-policies.ts`; the calling contract is in `README.md`.

## Publisher, creator and audience are separate

Every active Member can write a Post. They choose whether to publish personally or on
behalf of a Group, then explicitly choose an audience. Choirs can organise Events, but
**a Choir can never publish a Post**, even through an Admin.

The original human creator is retained. A Group Post shows its publishing Group to readers.
Only Admins and current representatives who may publish for that Group see “Posted by” the
original creator and named editor attribution. Other readers receive neither name in the
feed/detail data and see edit timestamps without editor names. Personal Post attribution
remains visible to its readers. Personal edits show an edit timestamp without naming the editor.
The publishing identity becomes fixed at first publication, including after recall.

To represent a Group, a Member needs a current Position appointment in that exact
active Group. The organisation catalogue controls which appointments grant or require
Membership. A CSK-wide Group has no owning Choir.

## Choosing an audience

Personal Posts and Group Posts may address all CSK. Alternatively, choose one or more
Group/Voice-family targets. Targets are OR'ed; Group and Voice family within a target are AND'ed.
A target may contain a Group, a Voice family (S/A/T/B), or both. The acting Member must qualify
for **every** selected Group:

| Audience | Who may select it? |
| --- | --- |
| A Group they belong to | Any current Member of that Group |
| A Section | Any current Member of the Section's Choir |
| A whole Choir they do not belong to | A representative publishing **on behalf of the specific CSK-wide Group they represent** |
| Any active Group | A current representative publishing on behalf of the active Board they represent |
| An archived Group | Nobody may newly select it |

The general CSK-wide exception covers whole Choirs only, not their Sections or committees. It
does not apply to personal Posts or Posts published for a different Group. For example,
a CSK-wide Board representative can publish as the Board to KK without belonging to KK.
A KK tenor can personally address the KK sopranos without belonging to that Section.

When publishing on behalf of an active Board, a current appointee in that Board may
choose any active Group, including Sections and committees.
Personal Posts and Posts for other Groups follow their ordinary audience-selection rules.

A Voice-only target is available to every active Member: selecting B with no Group means
bass singers across CSK. A Voice filter on a Group target narrows its audience without
changing who may select that Group.

Audience permission is checked at publication, republication and whenever the selected
publisher or audience changes. An ordinary text edit may retain an existing audience even if the
editor no longer belongs to it. Republication requires replacing/removing archived targets.

## Reading

A published Post addressed to all CSK is readable by every active Member. For selected
targets, matching **any one** target is enough. A Group criterion requires current Membership
in that exact Group. A Voice-family criterion matches the Voice division in a current Section
Membership, never self-reported voice capabilities. With a Choir criterion, that Section must
belong to the Choir; with a Section criterion, it must be that exact Section. Other Groups
allow Voice matching through any current Section Membership. Membership is checked when reading: newcomers see earlier Posts; former Members lose audience-based access.
Previously reading a Post does not grant continued access after its audience changes.

Feed cards and Post details show audience chips only for targets the current reader matches.
All-CSK Posts show an all-CSK chip. Author or management access adds no unrelated chips; the
editor retains the complete audience configuration.

Permission to address a Section does **not** grant readership of that Section's Posts.
Choir Membership alone does not grant readership of Section-targeted Posts.

There are three additional grounds for access:

- The original creator can always read their own personal Post.
- Current representatives can read Posts published on behalf of their Group, even if
  they do not belong to an audience Group.
- Admins can read every published Post and every Recalled Group Post.

Historical credit grants no special access to a Group Post: a former representative
must qualify through the audience or current management authority.

These readership rules apply equally to the feed, direct links, unread counts, unread IDs
and unread expiry information. The editor requires the editing authority shown below.

## Editing, recall and discard

| State | Who may read and edit? | Who may publish or republish? |
| --- | --- | --- |
| Never-published Draft, including one intended for a Group | Its creator only, including against Admins | Its creator, with valid publisher and audience permissions |
| Published personal Post | Creator and Admins may edit; readers follow the audience rules above | Already published |
| Recalled personal Post | Its creator only; it is a private Draft again | Its creator, with a valid audience |
| Published Group Post | Current Group representatives and Admins may edit; audience Members may read | Already published |
| Recalled Group Post | Current Group representatives and Admins | Current representatives with a valid audience, or Admins |

Everyone who may edit a published Post may recall it. Personal recall creates a private
Draft; Group recall creates a shared Recalled Group Post. Current managers can find
Recalled Group Posts alongside their private Drafts. Group recall preserves creator, publisher
and editor attribution. Personal recall clears the edit timestamp. Republication receives a
new publication time.

Only the author can discard a private Draft. That removes it from application views and
retains the database record. Recalled Group Posts remain available to their managers.

A handover applies to existing Group Posts: new representatives gain management access;
former representatives lose it, including the original creator. A private Draft is never
shared merely because it names a Group as its intended publisher.

## Admin exceptions and archived Groups

Admins may publish or republish for an active Group without Membership or a Position,
and may select any active audience. They may manage published and recalled Group content
without representation. They cannot access another creator's never-published private
Draft, publish as a Choir, publish as an archived Group, or select an archived audience.

Archiving an audience Group preserves historical access for its remaining current Members.
Archiving a publishing Group preserves its published Posts and attribution, but removes
representative management rights. Admins may edit, retarget to active audiences and recall
that Group's content. Republication requires an active publisher.

## Attribution, conflicting edits and unread status

Meaningful changes to title, body or audience update the edit timestamp on published Posts
and on Recalled Group Posts. Group Posts also record the acting Member as last editor.
Group recall and republication preserve editor information. Account inactivation retains
names. Erasure removes creator/editor identities and displays “former member” while
preserving timestamps.

An open editor retains its loaded version through background live updates. Saving,
recalling or discarding from an outdated screen is rejected rather than silently
overwriting another editor. The form keeps the submitted content; open the latest version
in a new tab to reconcile changes without losing the old text.

Existing read markers survive edits, recall and republication. A new audience Member is
unread if they have no marker and the Post falls within the existing 30-day unread window.
A new announcement should be a new Post.

Publishing, editing or recalling a published Post sends a content-free refresh to active
Members allowed to read it before or after the change. Readers who lose access still refresh
so the Post disappears from their open feed.

Memberships and appointments use Stockholm calendar dates. A term starts on its
start date and ends before its end date. An annual Group can be newly selected as
publisher or audience during its organisational year.
