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

**Draft**:
A Post that is not published, visible only to its author — whether it was never
published or has been Unpublished. Drafts are never shared; joint writing happens outside
the Hub. An author who no longer wants a Draft discards it: it is gone from every view, but,
like every Post, never deleted. An Event not yet published is an Event Draft, which is a
different thing.
_Avoid_: Unpublished post, hidden post, shared draft, deleted draft

**Unpublish**:
To recall a published Post: it leaves the News feed and its permalink and becomes its
author's Draft again. Nothing was sent, so nothing else needs undoing. Not a delete;
Posts are never deleted.
_Avoid_: Delete, archive, hide, retract

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
S1, S2, A1, A2, T1, T2, B1 or B2: a Voice when its family splits, as B1 in TTBB. A singer's
Voice in a Section, and what they can sing, are recorded in divisions only; someone who can sing
B can sing B1 and B2.
_Avoid_: Part, sub-voice

**Voice capability**:
A User's self-reported ability to sing a Voice division, independent of their Section
Memberships. Being able to sing a whole Voice family means being able to sing both of its divisions.
_Avoid_: Section Membership, vocal range

**Part**:
A line in a specific arrangement (*stämma* in a score), labelled with a Voice.
_Avoid_: Voice family, Section

**Section**:
The people in one Choir who sing a given Voice, such as MKB1 (B1) or KKB (B); every Choir has
four non-overlapping Sections. A singer belongs to exactly one Section in each Choir they sing
in, and their Voice is a Voice division contained by that Section's Voice: B1 or B2 in KKB.
_Avoid_: Voice, part, stämma

**Membership**:
Being in a Group for a period of time, from a start date until an end date; without an end date
it is current. Membership history is kept, and membership in a Group belonging to a Choir
implies membership in that Choir.
_Avoid_: Enrolment, role

**Position**:
A named organisational position in a Group (Swedish: *post*), such as Ordförande, Dirigent,
Notfiskal, Konsertmästare, Stämförälder, or Sexmästare. A Position is allowed in Group types, and
may be limited to some Groups of them, as Gigmästare KK to KK and the Gigmästeri. A member may
hold several Positions in a Group, except where Positions are elected posts, as on the Board:
there each member holds one. A Position is distinct from a permission role; use Post only for a
news announcement.
_Avoid_: Post, role, title, Admin

**Position holder**:
A member holding a Position in a Group over a period of their own, independent of their
Membership. Each Position has one holder per Group at a time, while one person may hold
several. Only a current member can hold a Position, and leaving the Group ends it.
_Avoid_: Officer, role owner

## Events

**Event**:
A dated entry in the CSK calendar: anything the choirs could put in their calendar, from a
rehearsal or gig to a körmöte or a room Booking. Events are flat, with no nesting. An Event's
own page in the Hub is its Event page.
_Avoid_: Activity, appointment, Event detail (for the page)

**Event type**:
The fixed kind of an Event: Rehearsal, Gig, Concert, Social, Rephelg, Körmöte, Booking,
Meeting or Other. A Körmöte is its own type; Meeting covers other meetings, such as the Board's.
Rehearsal, Gig and Social carry fields of their own.
_Avoid_: Category, tag

**Event Draft**:
An Event that is not yet published, visible only to those who may edit it. Publishing makes it
visible to its Audience, and a published Event never becomes a Draft again; it is cancelled
instead, and stays visible, struck through. Distinct from a Post's Draft.
_Avoid_: Unpublished event, hidden event

**Organiser group**:
The Group responsible for an Event, such as the Gigmästeri for a gig or the Sexmästeri for a
sittning. It decides who may edit the Event, never who it is for.
_Avoid_: Host, owner, Audience

**Target**:
One rule for who an Event is for: a Group, a Voice family, or both together, as in "B in KK".
Several Targets add up; an Event with none is for everyone in CSK.
_Avoid_: Invitee, recipient, filter

**Audience**:
The Users an Event is for, worked out from its Targets and the Memberships on the Event's
date, never stored. Without Targets it is every User with a Choir Membership on that date.
_Avoid_: Invitees, guest list, attendees

**Participation mode**:
What an Event collects from its Audience in advance: nothing, a Response (Yes, No or Maybe,
or strictly Yes or No with attendance expected), or a Registration from whoever wants to come.
Each Event type has a default the organiser may override.
_Avoid_: RSVP type, invitation type

**Event detail**:
A labelled value an organiser shows on an Event, such as "Dress code: Kavaj" or "Bring: Music
folder". Information to the Audience, in the organiser's order; never something the Hub
interprets, such as a time or a place.
_Avoid_: Field, property, Event page

**Location**:
A reusable venue an Event is held at, such as Repsalen, with an address and a map link. An
Event may name a Location, describe its place in free text, or both. Locations are archived,
never deleted.
_Avoid_: Venue, room, address

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
