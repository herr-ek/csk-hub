# Translation catalogues are central, not per-feature

The three message catalogues live together as `messages/sv.json`, `messages/en.json` and
`messages/de.json`, with keys namespaced by feature at the top level
(`memberManagement.import.duplicateEmail`). This runs against
`docs/codebase-structure.md`, which asks that a feature's domain logic, writes, reads,
tests and UI stay together, and which a per-feature catalogue would honour.

A catalogue is the one asset in this codebase whose natural grain runs crosswise to the
code. Developers edit it one feature at a time; translators edit it one language at a
time, needing to see every string they are responsible for at once. Scattering the
Swedish across a dozen feature folders serves the axis nobody actually works along, and
makes the parity check — do all three languages carry identical key sets? — a directory
walk instead of three file reads.

## Consequences

Locality is preserved where it matters, in the key rather than the file: the top-level
namespace matches the feature folder, so a feature's strings are still one contiguous
block and still obviously owned. Deleting a feature means deleting a namespace from
three files rather than three files.

The cost is real. A change to one feature now touches a file at the repo root that every
other feature also touches, so concurrent branches will collide in the catalogues more
often than they collide anywhere else. The collisions are mechanical — different keys in
the same JSON object — but they are collisions.

English is canonical: keys are named from English, `en.json` is written first, and the
other two are translations of it. Swedish being the default a Member sees is a fact about
this choir, not about authorship.
