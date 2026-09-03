# Codebase Structure

This guide records the structural preferences for CSK Hub. Future changes should preserve these patterns unless a feature needs a deliberate exception, in which case record the reason in an ADR.

## Design Vocabulary

Use the `codebase-design` vocabulary when discussing structure:

- **Module**: anything with an interface and an implementation.
- **Interface**: everything callers must know to use a module correctly, including invariants and error modes.
- **Seam**: where a module's interface lives and where behavior can vary.
- **Adapter**: a concrete implementation that satisfies an interface at a seam.
- **Depth**: leverage at the interface; prefer small interfaces that hide meaningful behavior.
- **Locality**: changes should concentrate in one place rather than spreading across callers.

Avoid shallow pass-through modules. A module earns its place when deleting it would push complexity back into multiple callers.

## Feature Modules

Prefer feature-oriented modules for product behavior. A future feature should keep its domain logic, write operations, read helpers, tests, and feature-specific UI close together instead of scattering them by technical layer.

The source tree uses four top-level areas plus Next.js and tooling-owned exceptions:

- `src/core`: app infrastructure, app shell wiring, and external adapters.
- `src/app`: Next.js route topology and framework route files.
- `src/shared`: cross-feature presentation primitives and generic helpers.
- `src/features/<feature-name>`: product and domain behavior.
- `src/proxy.ts`: Next.js proxy convention file.

Use `src/features/<feature-name>` for durable product capabilities, not route groups or user roles. For example, `admin` is a surface, not a feature.

Every feature lives under `src/features`; none sit at the `src` root. The grouping is not about the individual feature — the `features` segment says nothing `member-management` does not already say. It is about the root: it keeps the number of top-level areas fixed as the product grows, and it gives features a shared path prefix, which is what makes the rules under Dependency Direction expressible as tests rather than maintained by convention.

Use `src/shared` only for genuinely cross-feature modules:

- `src/shared/ui/base`: reusable design-system primitives and low-level controls.
- `src/shared/forms`: reusable form types and generic form presentation helpers.
- `src/shared/hooks`: cross-feature client hooks.
- `src/shared/utils.ts`: stable generic utilities such as `cn`, used by generated UI components.

Use `src/core` for infrastructure and app shell modules:

- `src/core/auth`: Better Auth setup, server/client auth objects, plugins, cookie integration, and auth infrastructure tests.
- `src/core/db`: database client and schemas.
- `src/core/email`: email delivery adapters.

Do not promote code to shared space just because two files currently look similar. Promote only when the interface is stable and the shared module improves locality.

### Workflow-local structure

Keep a feature folder at its current level when it represents one coherent product capability, but group files inside it by meaningful workflow when that improves locality. Do not create folders mechanically or based on a fixed file-count threshold.

For example, a groups management feature may eventually be organized like this:

```text
src/features/groups/
  collection/
  detail/
  hierarchy/
  index.ts
```

The subfolders are illustrative workflow boundaries, not a required template. Shared group-specific actions, schemas, helpers, or types may remain at the `groups/` root when they genuinely serve multiple workflows. A folder should earn its place by keeping related changes together and reducing the knowledge required by callers.

## Dependency Direction

Dependencies should point inward toward stable infrastructure and generic helpers:

- `src/app` may import `src/core`, `src/shared`, and feature public entrypoints.
- Feature modules may import `src/core` and `src/shared`.
- A feature may import another feature only through that feature's public entrypoint.
- `src/shared` may import other `src/shared` modules, but not `src/core` or `src/features`.
- `src/core` may import other `src/core` modules and `src/shared`, but not `src/features`.
- Framework convention files, such as `src/proxy.ts`, stay where Next.js expects them and delegate inward when their logic grows.

Prefer public entrypoints at feature and subfeature boundaries. Route files should import screens from entries such as `@/features/member-management`, not from deep implementation files like `@/features/member-management/members-screen`. Inside a feature or subfeature, local imports may target sibling implementation files directly.

## Drizzle Schema

Keep Drizzle schema files split by ownership under `src/core/db/schema`.

- Auth-owned models stay in `auth.ts`.
- Choir organization models stay in their own schema file.
- Do not mix unrelated future module models into an existing schema file just because Drizzle allows it.
- Generated Drizzle client must not be hand-edited.

When a model decision is hard to reverse or surprising, record the decision in `docs/adr/`.

## Next.js And React

Keep route files thin. A `page.tsx`, `layout.tsx`, or route handler should compose modules; it should not become the main implementation of a feature.

For screens with real behavior, split along meaningful seams:

- route/page module: routing, loading the initial screen, and composing the screen
- screen module: page-level layout and workflow orchestration
- feature UI modules: reusable or locally composed UI sections
- server/write modules: mutations, validation, authorization, and persistence
- query/read modules: data loading shaped for the screen

Prefer small, named UI modules when they protect locality. Avoid splitting JSX mechanically into tiny fragments that do not reduce knowledge required by callers.

### Read functions

Expose focused read functions directly rather than collecting unrelated screen reads in a broad query object. Names should describe the workflow and contract, such as `listGroupCollection`, `getGroupDetail`, or `getGroupHierarchy`.

Each read function should serve one caller or one coherent workflow and return a deliberately shaped result. A screen-shaped result is appropriate when it keeps persistence and composition details behind the module boundary; “focused” does not mean that every caller must assemble raw entity data itself. Separate workflows should have separate read functions even when they share lower-level service operations.

Focused reads improve locality, make data dependencies explicit, reduce accidental over-fetching, keep return types understandable, and give each workflow a stable testable seam. Avoid a single query function or return type that combines the needs of collection, detail, hierarchy, and other unrelated screens.

Server Components are the default. Use Client Components only for interaction, browser APIs, optimistic state, or controlled UI state. Put `"use client"` as low in the tree as practical.

## Reuse And Duplication

Avoid duplicate business rules, validation rules, Drizzle query shapes, and UI interaction patterns. Extract a module when reuse creates a stable interface and reduces future edits.

Do not extract too early:

- Two similar call sites can stay duplicated while the concept is still unclear.
- Three or more similar call sites should trigger a design check.
- Cross-feature duplication should be reviewed with the deletion test before extracting.

## UI Quality

Design mobile-first and responsive from the first implementation pass. Screens should work well on narrow viewports before desktop refinements are added.

Prioritize existing shadcn/ui-style components from `src/shared/ui/base` for common controls, layout primitives, dialogs, menus, tables, forms, feedback, and navigation. Add or adapt reusable UI primitives there when the pattern is genuinely shared; keep feature-specific compositions inside the feature module.

Prioritize fast perceived feedback:

- use pending states for mutations
- use optimistic updates when the rollback behavior is clear
- keep navigation and form interactions responsive
- avoid blocking the whole page when a smaller pending state is enough

Prefer composable, editable UI over one large TSX file. If changing a repeated visual or workflow pattern would require edits in several files, introduce or reuse a deeper UI module.

## Tests

Test through module interfaces. If a test needs to reach into implementation details, reconsider the module shape.

Prefer focused tests for domain logic, validation, authorization, write behavior, and meaningful query transformations. Routine unit tests for `.tsx` files and presentational components are not required. UI tests should cover meaningful user-visible workflows and regressions rather than snapshots or implementation details.

Use a limited number of high-value end-to-end tests for important workflows. Add a lower-level UI test only when it protects a durable user-visible regression that is not better covered through end-to-end testing. Temporary implementation-specific UI tests may be useful during development, but should be removed afterward unless they protect such a regression.

When adding a seam, only introduce an adapter abstraction when at least two adapters are real or imminent. One adapter usually means the seam is hypothetical.
