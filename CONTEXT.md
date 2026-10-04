# CSK Hub

The internal web application for Chalmers Choirs. It carries information out to the
organisation's singers and keeps track of rehearsals, events and gigs.

## Language

**CSK**:
Chalmers Sångkör is the single student association served by the platform. CSK is also the name of the collective choir formed when singers from the association appear together.
_Avoid_: Tenant, configurable organization

**Choir**:
One of CSK's three permanent ensembles: Manskören (MK), Kammarkören (KK), or Damkören (DK). New singers are placed in one of these Choirs; the Choirs usually rehearse separately but may take part in joint activities. A Choir is a Group of its own, always CSK-wide, and other Groups may belong to it.
_Avoid_: CSK, temporary project ensemble

**Admin**:
A User who may additionally invite people, change roles, remove Users, and act as
another User. Every Admin is a User; the two are not separate populations.
_Avoid_: Superuser, staff, moderator, board member

**Invite**:
An Admin's act of bringing a specific email address into the Hub. Membership is
obtainable only this way; there is no public sign-up. An Invite creates the User
immediately — it is an action, not a pending object that can be cancelled.
_Avoid_: Registration, sign-up, enrolment

**Inactive User**:
A User whose access has been withdrawn — typically because they have left the
organisation. They cannot sign in and are hidden from the default User list, but the
record survives so that historical participation remains intact. The ordinary outcome of
leaving.
_Avoid_: Deleted, banned, archived, disabled

**Erasure**:
The permanent destruction of a User's record at their request, under GDPR. Distinct
from becoming an Inactive User: erasure is irreversible, removes the User's identity
from retained Messages while preserving shared Conversation history.
_Avoid_: Delete, purge, GDPR-delete

**Post**:
A written announcement an Admin publishes to the whole choir, appearing in the News feed
and at its own permanent address. A Post carries no audience of its own — publishing one
means publishing it to every User.
_Avoid_: Article, news item, blog post, announcement email

**News feed**:
The single reverse-chronological list of published Posts at `/news`, identical for every
User. It is where information published in the Hub lives; it is not a copy of the
monthly email, which keeps running separately.
_Avoid_: Timeline, wall, dashboard, newsletter

## Groups

**Group**:
A set of people in CSK with Memberships over time: a Choir, a Section, the Board, a
committee, a gig group, a roddgrupp and so on. A Group is either CSK-wide or belongs
directly to one Choir; there is no deeper hierarchy. Groups are archived, never deleted.
_Avoid_: Team, role, Conversation

**Voice**:
A line someone sings, at either granularity: a Voice family or a Voice division, so "B" and
"B1" are both Voices. One Voice contains another when they are equal or the first is the
family of the second: B contains B and B1, B1 contains only B1. An attribute of a Section and
of a singer's Section Membership, never a group of people.
_Avoid_: Stämma (as a group), part

**Voice family**:
S, A, T or B: a whole Voice in an undivided setting, as B in SATB. The family of a division is
derived (B1 → B), never stored. "All basses" is never a Group; it is found through the Sections
whose Voice is in the bass family.
_Avoid_: Part, Section

**Voice division**:
S1, S2, A1, A2, T1, T2, B1 or B2: a Voice when its family splits, as B1 in TTBB. What a singer
can sing is recorded in divisions only; someone who can sing B can sing B1 and B2.
_Avoid_: Part, sub-voice

**Part**:
A line in a specific arrangement (*stämma* in a score), labelled with a Voice. A repertoire
concept, not modelled yet.
_Avoid_: Voice family, Section

**Section**:
The people in one Choir who sing a given Voice, such as MKB1 (B1) or KKB (B). Always a Group,
and it sings exactly one Voice. Every Choir has exactly four, and the Sections of a Choir never
overlap: one singing B rules out another singing B1. A singer is in exactly one Section of each
Choir they sing in, with one Voice that the Section's Voice contains: B1, B2 or, before they are
placed in a division, B in KKB; only B1 in MKB1.
_Avoid_: Voice, part, stämma

**Membership**:
Being in a Group over a period of time, from a start date until an end date; with no end
date it is current. History is kept: a Voice change ends one Membership and starts
another. A Membership in a Group that belongs to a Choir implies one in that Choir.
Distinct from Conversation Membership, and from being a User of the Hub.
_Avoid_: Enrolment, role

**Position**:
A named organisational position in a Group (Swedish: *post*): Ordförande, Dirigent,
Notfiskal, Konsertmästare, Stämförälder, Sexmästare. Which Positions a Group may have
depends on its kind. Not a permission role, and never called a "post", which is reserved
for news Posts.
_Avoid_: Post, role, title, Admin

**Position holder**:
A member holding a Position in a Group over a period of their own, independent of their
Membership. Each Position has one holder per Group at a time, while one person may hold
several. Only a current member can hold a Position, and leaving the Group ends it.
_Avoid_: Officer, role owner

## Messaging

**Conversation**:
A private exchange between Users. A Conversation is either a Direct Conversation or,
when that capability is introduced, a Group Conversation.
_Avoid_: Chat, thread

**Direct Conversation**:
A Conversation formed by exactly two distinct active Users. There is at most one
Direct Conversation for a pair of Users; after Erasure, its retained history is
read-only for the remaining User.
_Avoid_: DM, private message

**Group Conversation**:
A named Conversation between multiple Users. A User joining or rejoining a Group
Conversation can view its retained history from the beginning; after leaving, they
retain read-only access to the history visible when they left. Group Conversations are
represented in the model before their user-facing capability is introduced.
_Avoid_: Group chat

**Conversation Membership**:
A User's active or former participation in a Conversation. It is the source of
authority to view and send Messages in that Conversation.
_Avoid_: Participant, recipient

**Message**:
Text sent by an active Conversation User within a Conversation.
_Avoid_: Chat, DM

**Unread State**:
A User's per-Conversation position before its latest visible Message. It is a cursor;
when sender-visible read status is introduced, it means the User opened the Conversation,
not that they viewed each individual Message.
_Avoid_: Read receipt, seen state

**Erased Authorship**:
The identity-free authorship state of a retained Message after its author exercises
Erasure.
_Avoid_: Deleted message, anonymous User
