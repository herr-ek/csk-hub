``` ER Scheme
Groups(_id_, name, type)
	type -> GroupType

Enum GroupType:
	Commitee
	Board
	Choir (! Not in alternative)
	Misc/ResponsibilityGroup
	Voice (?)

GroupMembers(_userId_, _groupId_)
	userId -> Users.id
	groupId -> Groups.id

SubGroups(_main_, _sub_)
	main -> Groups.id
	sub -> Groups.id

--- Alternative ---
Choir as a separate table, since quite different from a group

Choirs(_id_, name)

ChoirMembers(_choir_, _user_, voice)
	choir -> Choirs.id
	user -> Users.id
	voice -> Voices

ChoirGroups(_choir_, _group_)
	choir -> Choirs.id
	group -> Groups.id

--- Voices ---

Enum Voices:
	B1
	B2
	A1
	A2
	T1
	T2
	S1
	S2

// What type of voice a user has the ability to sing. Might just be their main voice but some people can do several (e.g. both B1 and T2)
VoiceCapabilities(_user_, _voice_)
	user -> Users.id
	voice -> Voices


```



## Revised scheme (v2)

#### Terminology

| Term                | Meaning                                                                                                                                   | In the schema                         |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Voice**           | A musical concept: the line someone sings (B1, T2, ...). An attribute, **never** a group of people.                                       | `Voice` enum                          |
| **Part**            | The musical voice family S/A/T/B. Derived from a voice (B1 → B). Also never a group.                                                      | `Part` enum, fixed mapping from Voice |
| **Section**         | A social concept: the actual people in one choir who sing a given voice (or voices). Always a group.                                      | Group with `type = Section`           |
| **Choir**           | One of the choirs (MK, DK, KK). Always a group.                                                                                           | Group with `type = Choir`             |
| **Membership**      | Being in a group, over a period of time.                                                                                                  | `GroupMembers`                        |
| **Position**        | A named organisational position in a group (Notfiskal, Konsertmästare, Sexmästare, Stämförälder). Swedish: *post*. Not a permission role. | `Positions`                           |
| **Position holder** | A member holding a position in a group, over its own period of time, independent of the membership.                                       | `PositionHolders`                     |
| **News post**       | An item in the news feed. "Post" is reserved for this; never used for positions.                                                          | `NewsPosts` (news model)              |

Every choir has exactly **four sections**. In most choirs each section sings **one** voice (MK: T1, T2, B1, B2). In the chamber choir a section can sing **two** voices (KKB sings B1 + B2). A singer always has **one** voice.

Groups are either **CSK-wide** (`choirId = null`) or **belong to a choir** (`choirId` set). There is no deeper hierarchy: every subgroup belongs directly to a choir.

A person can hold **several positions in the same group** (e.g. Notfiskal + Konsertmästare in KK). Each position has **one holder** per group at a time.

"Position" means an organisational position only. If standing order / formation is ever modelled, call it **Placement** or **Formation**.

``` ER Scheme
Users(_id_, ...)

// Enum so the code can branch on it with type-safe comparisons.
// Storage: native Postgres enum (easy to ADD a value, awkward to remove/rename)
// or text + CHECK constraint (easier to change). Either maps to an enum in code.
Enum GroupType:
	Choir
	Section         // the people in a choir singing a given voice/voices (4 per choir)
	Board
	Committee
	GigGroup
	Gigmästeri
	Sexmästeri
	Rodd
	Fest
	Rephelg
	Konsert

Groups(_id_, name, type, choirId?, active)
	type     -> GroupType
	choirId  -> Choirs.groupId   // the choir this group belongs to. null = CSK-wide.
	                             // A Choir group itself has choirId = null.

	// Every choir has a "Roddgrupp" etc., so names are unique per choir, not globally.
	// CSK-wide groups have choirId = null, and NULLs are not equal in a unique index:
	// use NULLS NOT DISTINCT (Postgres 15+) or an index on COALESCE(choirId, 0)
	UNIQUE (name, choirId) NULLS NOT DISTINCT WHERE active

// A choir IS a group (1:1 extension), so membership, news targeting
// and permissions work the same everywhere
Choirs(_groupId_, ...choir-specific fields)
	groupId -> Groups.id

--- Voices (musical) ---

// Two separate enums so Part and Voice can't be mixed up in code
Enum Part:  S, A, T, B
Enum Voice: S1, S2, A1, A2, T1, T2, B1, B2
// Fixed mapping Voice -> Part in code (B1 -> B, T2 -> T, ...). Not stored.

// What a user CAN sing (e.g. finding a T2 to cover a gig). Real voices only.
VoiceCapabilities(_userId_, _voice_)
	userId -> Users.id
	voice  -> Voice

--- Sections (social) ---

// Which voices a section sings. A section is defined by its voices, not by a fixed kind.
//   MKB1: one row  (B1)
//   KKB:  two rows (B1, B2)
// A section group with type = Section must have at least one row here.
SectionVoices(_sectionId_, _voice_)
	sectionId -> Groups.id       // a group with type = Section
	voice     -> Voice

--- Membership ---

// Being in a group. Dated, so history is kept (Styret 25/26 vs 26/27, alumni, voice changes).
// Taking or leaving a position does NOT touch this table.
GroupMembers(_userId_, _groupId_, _startDate_, endDate?, voice?)
	userId -> Users.id
	groupId -> Groups.id
	voice  -> Voice              // the singer's ONE voice; only set on Section memberships
	endDate = null -> current member

	// The singer's voice must be one the section sings.
	// Composite FK: when voice is NULL the FK is not checked (MATCH SIMPLE),
	// so non-section memberships are unaffected. Enforced by the database.
	(groupId, voice) -> SectionVoices(sectionId, voice)

	// At most one CURRENT membership per user per group (history rows are fine)
	UNIQUE (userId, groupId) WHERE endDate IS NULL

--- Positions ---

// Named organisational positions in a group (Swedish: poster). Not permission roles.
Positions(_id_, name)
	// e.g. Ordförande, PR-mästare, Gigmästare, Sexmästare, Sexmästarinna,
	//      Conductor, Notfiskal, Konsertmästare, Stämförälder

// Optional: which positions are allowed in which kind of group
// (stops e.g. "Conductor" in a festgrupp)
GroupTypePositions(_type_, _positionId_)
	type       -> GroupType
	positionId -> Positions.id

// Who holds which position, in which group, when. Own term, independent of the membership.
PositionHolders(_userId_, _groupId_, _positionId_, _startDate_, endDate?)
	userId     -> Users.id
	groupId    -> Groups.id
	positionId -> Positions.id
	endDate = null -> current holder

	// One holder per position per group at a time.
	// A person may hold several different positions in the same group.
	// Gives "one stämförälder per section" and "one conductor per choir" for free.
	UNIQUE (groupId, positionId) WHERE endDate IS NULL
```

### Example placement

| Group                                    | type         | choirId | SectionVoices |
| ---------------------------------------- | ------------ | ------- | ------------- |
| Styret                                   | Board        | null    |               |
| Committees, gig groups                   | Committee / GigGroup | null |           |
| Gigmästeri, Sexmästeri                   | Gigmästeri / Sexmästeri | null |        |
| CSK konsertgrupp                         | Konsert      | null    |               |
| MK konsertgrupp                          | Konsert      | MK      |               |
| MK roddgrupp / festgrupp / rephelgsgrupp | Rodd / Fest / Rephelg | MK |            |
| MK, DK, KK                               | Choir        | null    |               |
| MKT1, MKT2, MKB1, MKB2                   | Section      | MK      | T1 / T2 / B1 / B2 (one each) |
| DKS1, DKS2, DKA1, DKA2                   | Section      | DK      | S1 / S2 / A1 / A2 (one each) |
| KKS, KKA, KKT, KKB                       | Section      | KK      | (S1, S2) / (A1, A2) / (T1, T2) / (B1, B2) |

Structure: one level. A group is CSK-wide or belongs to a choir.

```
CSK-wide: Styret, committees, gig groups, Gigmästeri, Sexmästeri, CSK konsertgrupp

MK  (Choir)                               KK  (Choir)              ← positions: Conductor, Notfiskal, Konsertmästare
├─ MKT1, MKT2, MKB1, MKB2  (Sections)     ├─ KKS, KKA, KKT, KKB  (Sections)  ← singers here, each with ONE voice
└─ MK konsertgrupp, roddgrupp, ...        └─ KK konsertgrupp, roddgrupp, ...
```

Example: Sara sings B1 in KK and holds two positions there.

```
GroupMembers   (Sara, KK,  2023-08-20)
GroupMembers   (Sara, KKB, 2023-08-20, voice = B1)
PositionHolders(Sara, KK,  Notfiskal,      2025-09-01)
PositionHolders(Sara, KK,  Konsertmästare, 2026-09-01)
```

More examples:

```
GroupMembers   (Erik, KK,  2020-01-10)                   -- conductor, doesn't sing: choir row only
PositionHolders(Erik, KK,  Conductor,    2020-01-10)

GroupMembers   (Olof, KK,  2022-08-25)
GroupMembers   (Olof, KKB, 2022-08-25, voice = B2)
PositionHolders(Olof, KKB, Stämförälder, 2025-09-01)     -- position on the section

GroupMembers   (Nils, MK,   2024-08-22)
GroupMembers   (Nils, MKB1, 2024-08-22, voice = B1)
```

Example, Sexmästeri:

| User    | Membership | Position      |
| ------- | ---------- | ------------- |
| Anna    | yes        | Sexmästare    |
| Bertil  | yes        | Sexmästarinna |
| Cecilia | yes        | (medhjälpare: no position) |
| David   | yes        | (medhjälpare: no position) |

### Rules (enforced in the app)

- **Choir groups are always CSK-wide** (`choirId = null`); only non-choir groups can belong to a choir.
- **Members of a choir's groups are members of that choir**: joining a group with `choirId = X` requires (or creates) membership in choir X. This means a news post to a choir already reaches everyone in its sections and other groups. No propagation logic needed.
- **Permissions follow the choir**: a position on a choir (e.g. Conductor) also gives rights in every group with that `choirId` (e.g. the KK conductor can publish to KKB).
- **Recipients are deduplicated** (`SELECT DISTINCT userId`): a singer in both MK and KK gets a news post targeted at both only once.
- **Sections**:
	- exactly four `Section` groups per choir
	- each section has at least one `SectionVoices` row
	- a voice belongs to at most one section per choir (B1 can't be in both KKB and another KK section)
	- these are app rules or triggers (`choirId` lives on `Groups`, not on `SectionVoices`)
- **Singers are members of the choir + exactly one section** in it, with `voice` set. The DB checks the voice is one the section sings; "one section per choir per singer" is an app rule (or trigger).
- **`voice` is only set on Section memberships**, never on choir or other group memberships.
- **Multiple choirs per singer** is allowed: one section (and one voice) in each.
- **Position holders must be current members** of the group they hold the position in. When a membership ends, end that person's positions in the group too. App rule or trigger.
- **One holder per position per group at a time**, enforced by the partial unique index. A person may hold several positions in the same group. Members without a position (medhjälpare) are simply members.
- **Stämförälder** is a position on the section: one per section.
- **Choir-specific positions** (Conductor, Notfiskal, Konsertmästare) are positions on the choir group.
- **Voice changes**:
	- within a section (KKB: B2 → B1): end the membership row, start a new one with the new voice
	- between sections (MKB2 → MKB1): end the old section membership, start a new one
	- either way history is kept
- **Board positions that lead another group** (e.g. the board's Sexmästare leads the Sexmästeri): the person holds the Sexmästare position in both Styret and the Sexmästeri (two `PositionHolders` rows, plus membership in both). The app should create/end both together when the board changes.
- Groups are archived (`active = false`), never deleted, so history stays intact.

### Belongs elsewhere

- **News targeting** → a target is a group, a part, or both:
	```
	NewsTargets(_newsPostId_, groupId?, part?)
		newsPostId -> NewsPosts.id
		groupId    -> Groups.id
		part       -> Part
		CHECK (groupId IS NOT NULL OR part IS NOT NULL)
	```
	- `groupId = MKB1`         → members of that group
	- `groupId = KK`           → members of KK (= everyone in KK's sections and groups)
	- `part = B`               → all basses in CSK: members of every section whose `SectionVoices` include a B voice (MKB1, MKB2, KKB, ...)
	- `groupId = KK, part = B` → basses in KK only
	"All basses" is deliberately not a group; it's found via `SectionVoices` + the Voice → Part mapping.
	The CSK konsertgrupp no longer links to the choir konsertgrupper. To reach "all concert groups", target several groups, or later add targeting by `type = Konsert`.
- Gigs → events model: `Gigs(_id_, ..., assignedGroupId -> Groups.id)`. The Gigmästeri plans gigs; the gig group is assigned. Gigmästeri position holders get rights to create gigs/assign groups through their position, not through a group hierarchy.
- Cleaning schedule → same pattern: `CleaningDuty(_week_, groupId -> Groups.id)`, assigned to a section (KKB, MKB1, DKS2, ...).

## ER diagram (v2)

```mermaid
erDiagram
    Users {
        int id PK
    }
    Groups {
        int id PK
        string name "unique per choirId among active"
        GroupType type "enum: Choir, Section, Board, ..."
        int choirId FK "null = CSK-wide"
        bool active
    }
    Choirs {
        int groupId PK, FK "type = Choir"
    }
    SectionVoices {
        int sectionId PK, FK "group with type = Section"
        Voice voice PK "enum: S1..B2"
    }
    GroupMembers {
        int userId PK, FK
        int groupId PK, FK
        date startDate PK
        date endDate "null = current"
        Voice voice FK "only on Section memberships"
    }
    Positions {
        int id PK
        string name "Notfiskal, Konsertmästare, ..."
    }
    GroupTypePositions {
        GroupType type PK "enum"
        int positionId PK, FK
    }
    PositionHolders {
        int userId PK, FK
        int groupId PK, FK
        int positionId PK, FK
        date startDate PK
        date endDate "null = current; one holder per position per group"
    }
    VoiceCapabilities {
        int userId PK, FK
        Voice voice PK "enum, real voices only"
    }

    Groups ||--o| Choirs : "is a"
    Choirs |o--o{ Groups : "owns"
    Groups ||--o{ SectionVoices : "sings"
    Users ||--o{ GroupMembers : "member"
    Groups ||--o{ GroupMembers : "has"
    SectionVoices |o--o{ GroupMembers : "voice of"
    Users ||--o{ PositionHolders : "holds"
    Groups ||--o{ PositionHolders : "has position"
    Positions ||--o{ PositionHolders : "held as"
    Positions ||--o{ GroupTypePositions : "allowed in"
    Users ||--o{ VoiceCapabilities : "can sing"
```
