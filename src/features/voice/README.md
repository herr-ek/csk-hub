# Voice

The Voice types and what each user can sing. Terminology lives in
[`CONTEXT.md`](../../../CONTEXT.md#groups): a Voice is a family (S, A, T, B) or one of its
divisions (S1 … B2), and one Voice contains another when they are equal or the first is the
family of the second.

## Interface

`@/features/voice/model` is universal: the `Voice`, `VoiceFamily` and `VoiceDivision` types,
`familyOf`, the only place a Voice's family is decided, `divisionsOf`, `isVoiceDivision`, and
`contains`. The [`org-structure`](../org-structure/README.md) feature uses it for Sections and
Section Memberships.

`@/features/voice` is server-only: `setVoiceCapabilities` replaces what a user can sing, in
divisions only (someone who can sing B can sing B1 and B2), and `listVoiceCapabilities` reads it.
A family returns `{ success: false, error: "capability-not-a-division" }`.

## Database

`src/core/db/schema/voice.ts` holds the `voice` enum and `voice_capability`. The migration adds
two Postgres domains over the enum by hand, `voice_family` and `voice_division`;
`voice_capability.voice` is a `voice_division`, so the database refuses families on its own.

Postgres has no `=` for a domain over an enum, so a query filtering on `voice_capability.voice`
casts it first (`${voiceCapability.voice}::voice = 'B1'`), or it fails with "operator does not
exist". Keys, `ORDER BY` and `DISTINCT` need no cast.
