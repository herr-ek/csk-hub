# CSK Hub

The internal web application for Chalmers Choirs. It carries information out to the
organisation's singers and keeps track of rehearsals, events and gigs.

## Language

**CSK**:
Chalmers Sångkör is the single student association served by the platform. CSK is also the name of the collective choir formed when singers from the association appear together.
_Avoid_: Tenant, configurable organization

**Choir**:
One of CSK's three permanent ensembles: Manskören (MK), Kammarkören (KK), or Damkören (DK). New singers are placed in one of these Choirs; the Choirs usually rehearse separately but may take part in joint activities.
_Avoid_: CSK, temporary project ensemble

**Member**:
A person who belongs to Chalmers Choirs and holds a login to the Hub. The unit of
membership is the person, not the person-in-a-choir.
_Avoid_: User (reserve that strictly for the Better Auth `user` record — the credentials
and session data behind a Member, not the person)

**Admin**:
A Member who may additionally invite people, change roles, remove Members, and act as
another Member. Every Admin is a Member; the two are not separate populations.
_Avoid_: Superuser, staff, moderator, board member

**Invite**:
An Admin's act of bringing a specific email address into the Hub. Membership is
obtainable only this way; there is no public sign-up. An Invite creates the Member
immediately — it is an action, not a pending object that can be cancelled.
_Avoid_: Registration, sign-up, enrolment

**Inactive Member**:
A Member whose access has been withdrawn — typically because they have left the
organisation. They cannot sign in and are hidden from the default Member list, but the
record survives so that historical participation remains intact. The ordinary outcome of
leaving.
_Avoid_: Deleted, banned, archived, disabled

**Erasure**:
The permanent destruction of a Member's record at their request, under GDPR. Distinct
from becoming an Inactive Member: erasure is irreversible, takes the participation
history with it, and is exercised rarely and deliberately.
_Avoid_: Delete, purge, GDPR-delete
