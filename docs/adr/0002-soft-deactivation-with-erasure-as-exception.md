# Soft deactivation is the default; erasure is the exception

Removing a User marks them inactive rather than deleting the row: they cannot sign in
and are hidden from the default User list, but the record survives. A separate,
explicit Erasure action performs a true delete, and exists to serve GDPR requests from
departing Users.

## Consequences

Choir membership turns over every year, so removal is routine rather than rare. The
`user` table's foreign keys cascade on delete, which means a hard delete also destroys
the sessions, accounts, and — once rehearsals, events and gigs exist — the participation
history that references the User. Soft deactivation keeps that history intact for the
ordinary case while leaving a deliberate path to destroy it on request.

The consequence to watch: a deactivated User still occupies their email address, which
is `UNIQUE`. Re-inviting a departed User is out of scope by decision, but the attempt
must fail with a clear message rather than a raw constraint violation.
