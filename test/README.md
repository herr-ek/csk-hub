# Tests

Run tests from the repository root with Bun 1.4.0 or later:

```sh
bun run tst:unit  # no PostgreSQL or Docker required
bun run tst:db    # disposable PostgreSQL 17, requires Docker Compose
bun run tst       # both suites; also used by bun run pr
```

The runner selects ordinary `*.test.*` / `*.spec.*` files for unit tests and
`*.db.test.ts` files for database tests. Keep tests beside the module they exercise.
Both suites run with file isolation, in separate processes. Unit tests receive test
application settings and an unreachable database URL, never the development URL.
Missing database prerequisites are failures, not skipped coverage.
If Docker is unavailable, the runner fails before provisioning and reports the daemon
error. Check `docker context ls` and select the context for your running engine, start
your Docker daemon, or supply a local PostgreSQL server through `TEST_POSTGRES_URL`
as described below. For example, if Colima is running while the selected context points
at Docker Desktop, use `DOCKER_CONTEXT=colima bun run tst` (or `bun run pr`).

## Database lifecycle

`databaseTest()` supplies a fresh database for **each test**. It applies the committed
Drizzle migrations, including handwritten SQL. The test body and its optional feature
fixture receive `{ db, url }`; they can open additional connections or use real
transactions. Test databases are dropped after success, assertion failures and fixture
failures. Migration failures clean up too. Close additional connections in `finally`.

```ts
import { expect } from "bun:test"
import { databaseTest } from "@test/database-test"

const test = databaseTest() // or databaseTest(async database => featureFixture(database))

test("persists a change", async ({ db }) => {
  // Arrange all data here or in the feature fixture; no preceding test is required.
  // Exercise the real module and assert persisted results through db.
  expect(db).toBeDefined()
})
```

Features own their fixture builders; `test/` owns provisioning, migration, lifecycle
and output capture. Database tests run serially because console capture is process-wide.
Use multiple connections **inside a test** to exercise concurrency. Rollback alone is
not the isolation mechanism: tests may commit, run DDL or open independent connections.
The default 60-second test timeout includes setup, assertions and cleanup. A shorter
35-second fixture/body deadline reserves time for cleanup even when a test never
resolves. Tests that need longer can pass a third timeout argument to `test()`.

The default runner starts a uniquely named Compose project, using a random loopback
port and disposable storage. It waits for readiness and removes that project on exit.
The development Compose project and its persistent data are independent.

To use an already-running local PostgreSQL server instead:

```sh
TEST_POSTGRES_URL='postgresql://test_user:test_password@localhost:5432/postgres' bun run tst:db
```

The role needs `CREATEDB`; use PostgreSQL 17 to match the default test service.
`POSTGRES_URL` is never used for test provisioning. Remote hosts and connection override
parameters are refused before connecting. Each runner invocation generates its own
random database prefix, and its final cleanup can drop only databases with that exact
prefix. This recovers databases abandoned by a failed or terminated test process without
touching another run. SIGINT and SIGTERM trigger cleanup. SIGKILL of the runner or a
machine crash cannot run cleanup; a leftover Compose project may then need manual removal
(`docker compose ls` lists its `csk-tests-…` name).

## Focused runs and diagnostics

```sh
bun run tst:db --file seed-org-structure -t 'is safe to run again'
bun run tst:db --randomize --seed 42
bun run tst:db --verbose
```

`--file` selects a path substring; `-t` selects test names. Retry and rerun flags are
also supported. File filtering happens before Bun starts, so a unit run never discovers
database tests. Database tests need no top-level `await`, skip logic or manual lifecycle
hooks. Passing database tests discard captured console and migration subprocess output;
failures print it with the test name. `--verbose` (or `TEST_VERBOSE=1`) prints it on
success too. Direct ops commands continue to show their output.

Use these commands instead of bare `bun test`: Bun's default discovery includes both
kinds of test and does not provision PostgreSQL or provide run-owned cleanup.
