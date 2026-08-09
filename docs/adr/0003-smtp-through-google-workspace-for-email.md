# Email goes out over SMTP through Google Workspace

The Hub sends mail by authenticating as the Chalmers Choirs Google Workspace account over
`smtp.gmail.com:587` with a Google app password, rather than through a transactional email
provider. The whole transport sits behind one module, `src/core/email`, whose `sendEmail`
and `sendEmails` are the only way anything in the application sends a message.

## Consequences

The organisation already owns the Workspace domain, so this needs no new vendor, no new
bill, and no new account for a volunteer board to hand over each year — which matters more
here than deliverability features nobody has asked for. Mail arrives from a real, familiar
address.

The cost is Google's quota: it throttles per minute and caps sending at roughly 2,000
external recipients per day. That is comfortable for password resets and Invites, and
uncomfortable for anything resembling a newsletter to every Member. `sendEmails` therefore
takes a concurrency bound rather than letting callers loop, and the cap is the number to
check before any future bulk feature is designed.

Two operational dependencies follow. The account must be a real user with 2-Step
Verification enabled — an app password cannot be issued to an alias or a Group — and the
password is a credential in the environment rather than a revocable API key with scopes.

Because sending needs a Node runtime, a route that sends must not opt into the Edge
runtime. In Next 16 that costs nothing: `nodejs` is already the default and Edge is
deprecated, so the requirement is simply to not export `runtime`.

Nothing outside `src/core/email` imports `nodemailer` or knows SMTP exists, so replacing
this with a transactional provider later is a change to one module. That is the point of
the abstraction, and the reason this decision is cheap to revisit if the quota becomes the
binding constraint.
