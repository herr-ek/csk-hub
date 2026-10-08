# CSK Hub

The internal web application for Chalmers Choirs. It shares information with the
organisation's singers and tracks rehearsals, events and gigs.

## Language

**User**:
A person with an account in CSK Hub. User status is distinct from Membership in a Group.

**CSK**:
Chalmers Sångkör is the single student association served by the platform. CSK is also the name of the collective choir formed when singers from the association appear together.
_Avoid_: Tenant, configurable organization

**Choir**:
One of CSK's three permanent ensembles: Manskören (MK), Kammarkören (KK), or Damkören (DK). New singers are placed in one of these Choirs; the Choirs usually rehearse separately but may take part in joint activities. A Choir is a Group of its own, always CSK-wide, and other Groups may belong to it.
_Avoid_: CSK, temporary project ensemble

**Admin**:
A User with additional authority to invite people, change roles, remove Users, and act as
another User.
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
A written announcement an Admin publishes to every User. A Post has no audience of its
own.
_Avoid_: Article, news item, blog post, announcement email

**News feed**:
The shared, reverse-chronological list of published Posts, identical for every User. It
holds information published in the Hub; the monthly email remains separate.
_Avoid_: Timeline, wall, dashboard, newsletter

## Groups

**Group**:
A set of people in CSK with Memberships over time: a Choir, a Section, the Board, a
committee, a gig group, a roddgrupp and so on. A Group is either CSK-wide or belongs
directly to one Choir; there is no deeper hierarchy. Groups are archived, never deleted.
_Avoid_: Team, role, Conversation

**Voice**:
A line someone sings, at either granularity: a Voice family or a Voice division, such as B
or B1. A Voice belongs to a Section and a singer's Section Membership; it is never a group
of people.
_Avoid_: Stämma (as a group), part

**Voice family**:
S, A, T or B: a whole Voice in an undivided setting, as B in SATB. The family of a division
is the letter before its number (B1 → B).
_Avoid_: Part, Section

**Voice division**:
S1, S2, A1, A2, T1, T2, B1 or B2: a Voice when its family splits, as B1 in TTBB. What a singer
can sing is recorded in divisions only; someone who can sing B can sing B1 and B2.
_Avoid_: Part, sub-voice

**Part**:
A line in a specific arrangement (*stämma* in a score), labelled with a Voice.
_Avoid_: Voice family, Section

**Section**:
The people in one Choir who sing a given Voice, such as MKB1 (B1) or KKB (B); every Choir has
four non-overlapping Sections. A singer belongs to exactly one Section in each Choir they sing
in, and their Voice must be contained by that Section's Voice.
_Avoid_: Voice, part, stämma

**Membership**:
Being in a Group for a period of time, from a start date until an end date; without an end date
it is current. Membership history is kept, and membership in a Group belonging to a Choir
implies membership in that Choir.
_Avoid_: Enrolment, role

**Position**:
A named organisational position in a Group (Swedish: *post*), such as Ordförande, Dirigent,
Notfiskal, Konsertmästare, Stämförälder, or Sexmästare. A Position is distinct from a
permission role; use Post only for a news announcement.
_Avoid_: Post, role, title, Admin

**Position holder**:
A member holding a Position in a Group over a period of their own, independent of their
Membership. Each Position has one holder per Group at a time, while one person may hold
several. Only a current member can hold a Position, and leaving the Group ends it.
_Avoid_: Officer, role owner

## Messaging

**Conversation**:
A private exchange between Users, either a Direct Conversation or a Group Conversation.
_Avoid_: Chat, thread

**Direct Conversation**:
A Conversation formed by exactly two distinct active Users. There is at most one
Direct Conversation for a pair of Users; after Erasure, its retained history is
read-only for the remaining User.
_Avoid_: DM, private message

**Group Conversation**:
A named Conversation between multiple Users. A User joining or rejoining can view its
retained history from the beginning; after leaving, they retain read-only access to the
history visible when they left.
_Avoid_: Group chat

**Conversation Membership**:
A User's active or former participation in a Conversation. It is the source of
authority to view and send Messages in that Conversation.
_Avoid_: Participant, recipient

**Message**:
Text sent by an active Conversation User within a Conversation.
_Avoid_: Chat, DM

**Unread State**:
A User's position before the latest Message they have seen in a Conversation. It records that
the User opened the Conversation, not that they viewed each individual Message.
_Avoid_: Read receipt, seen state

**Erased Authorship**:
The identity-free authorship state of a retained Message after its author exercises
Erasure.
_Avoid_: Deleted message, anonymous User
