# Code Style

Use this guide when writing or reviewing code, naming files or migrations, or documenting public APIs. For module placement and dependency boundaries, see [codebase-structure.md](codebase-structure.md).

## Public API Documentation

Document functions exported from a module with TSDoc when callers need guidance
beyond what a clear name and type signature provide. Describe how to use the
function, its important inputs and outputs, and any invariants, side effects,
error modes, or authorization expectations a caller must respect. This keeps
the module interface discoverable at the call site instead of requiring callers
to inspect its implementation.

During implementation and review, add missing TSDoc to exported functions whose
correct use is not already obvious from their signature. Keep comments focused
on the caller-facing contract; do not restate types or document private helpers
solely for completeness.

## Naming And Function Style

### Files And Components

- Use PascalCase for `.tsx` filenames and React component names, such as `GroupDetailScreen.tsx` exporting `GroupDetailScreen`.
- Use kebab-case for other filenames and directories, such as `group-queries.ts`, `use-group-selection.ts`, and `user-management/`. Compound extensions stay intact, such as `group-queries.test.ts`.
- Preserve names required by frameworks and tools, including Next.js convention files such as `page.tsx`, `layout.tsx`, and `error.tsx`, generated files, and standard documentation names such as `README.md` and `AGENTS.md`.

These casing rules govern file and directory names; keep ordinary JavaScript/TypeScript variables and functions in camelCase and types in PascalCase.

### Database Migrations

Give every new database migration a meaningful kebab-case name describing the change, such as `add-group-memberships` or `post-body-to-document`. Keep Drizzle's generated ordering prefix; avoid its default random names.

Generate a named migration with `bun run db:generate --name=add-group-memberships`. Choose the name when generating it so the SQL filename and migration metadata agree. Preserve names of existing committed migrations.

### Function Declarations And Arrow Functions

Prefer named `function` declarations for module-level functions, exported operations, React components, and hooks. They make the main operations easy to identify and support declaration hoisting. Use `async function` for asynchronous operations.

Use arrow functions for inline callbacks, such as `items.map((item) => item.id)`, and local handlers or closures inside another function or component. Use a `const` arrow function when a function expression needs an explicit callable type, or when it must capture lexical `this`.

Both forms can close over surrounding variables; a closure alone does not require an arrow function. Avoid switching equivalent forms solely for personal preference in unrelated code. Use a regular function where a callback's caller needs to supply `this`.

For example, use a function declaration for the component and a `const` arrow function for a local event handler:

```tsx
import { useState } from "react"

function Counter() {
  const [count, setCount] = useState(0)

  const handleClick = () => {
    setCount((current) => current + 1)
  }

  return <button onClick={handleClick}>{count}</button>
}
```

`Counter` is the main component; `handleClick` is a local callback passed to `onClick`.

