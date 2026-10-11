import { resolve } from "node:path"
import { cleanupTestDatabases, withAdmin } from "./database"
import { databaseTestConnection } from "./database-config"

const root = resolve(import.meta.dir, "..")

export function selectTestFiles(files: string[], kind: "unit" | "db", filter?: string): string[] {
  return files
    .filter((file) => !/^(node_modules|\.next|\.git)\//.test(file))
    .filter((file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file))
    .filter((file) => /\.db\.test\.[cm]?[jt]sx?$/.test(file) === (kind === "db"))
    .filter((file) => !filter || file.includes(filter))
    .sort()
}

async function main() {
  const [kind, ...args] = process.argv.slice(2)
  if (!["unit", "db", "all"].includes(kind ?? "")) throw new Error("Expected unit, db or all")
  const flags: string[] = []
  let filter: string | undefined
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--file") {
      filter = args[++i]
      if (!filter) throw new Error("--file needs a path substring")
    } else if (arg === "--verbose") {
      process.env.TEST_VERBOSE = "1"
    } else if (["-t", "--test-name-pattern", "--seed", "--rerun-each", "--retry", "--bail"].includes(arg)) {
      const value = args[++i]
      if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value`)
      flags.push(arg, value)
    } else if (/^--(test-name-pattern|seed|rerun-each|retry|bail)=.+$/.test(arg)) {
      flags.push(arg)
    } else if (["--randomize", "--only-failures"].includes(arg)) {
      flags.push(arg)
    } else {
      throw new Error(`Unsupported test option: ${arg}. Use --file, -t, --randomize, --seed or --verbose.`)
    }
  }
  const files = Array.from(new Bun.Glob("**/*.{ts,tsx,js,jsx,mts,cts}").scanSync({ cwd: root, onlyFiles: true }))
  let child: ReturnType<typeof Bun.spawn> | undefined
  let killTimer: ReturnType<typeof setTimeout> | undefined
  let interrupted = 0
  const interrupt = (signal: "SIGINT" | "SIGTERM") => {
    interrupted = signal === "SIGINT" ? 130 : 143
    const running = child
    running?.kill(signal)
    if (running && !killTimer) killTimer = setTimeout(() => running.kill("SIGKILL"), 5_000)
  }
  const onInt = () => interrupt("SIGINT")
  const onTerm = () => interrupt("SIGTERM")
  process.on("SIGINT", onInt)
  process.on("SIGTERM", onTerm)

  async function command(cmd: string[], capture = false, env = process.env, cleanup = false) {
    if (interrupted && !cleanup) throw new Error("Test run interrupted")
    child = Bun.spawn(cmd, {
      cwd: root,
      env,
      stdout: capture ? "pipe" : "inherit",
      stderr: capture ? "pipe" : "inherit"
    })
    const running = child
    let timedOut = false
    const deadline = setTimeout(
      () => {
        timedOut = true
        running.kill("SIGKILL")
      },
      capture ? 120_000 : 600_000
    )
    let result: [number, string, string]
    try {
      result = await Promise.all([
        running.exited,
        capture && running.stdout instanceof ReadableStream ? new Response(running.stdout).text() : Promise.resolve(""),
        capture && running.stderr instanceof ReadableStream ? new Response(running.stderr).text() : Promise.resolve("")
      ])
    } finally {
      clearTimeout(deadline)
      clearTimeout(killTimer)
      killTimer = undefined
      child = undefined
    }
    const [code, stdout, stderr] = result
    if (timedOut) throw new Error(`${cmd[0]} exceeded the test runner deadline`)
    if (capture && code !== 0) throw new Error(`${cmd[0]} failed (${code}):\n${stdout}${stderr}`)
    return { code, stdout }
  }

  async function tests(suite: "unit" | "db") {
    const selected = selectTestFiles(files, suite, filter)
    if (!selected.length) throw new Error(`No ${suite} tests match${filter ? ` ${filter}` : ""}`)
    const env = {
      ...process.env,
      ENVIRONMENT: "test",
      // Unit tests must never connect to application data. DB tests use explicitly supplied fixtures.
      POSTGRES_URL: "postgresql://127.0.0.1:1/csk_unit_tests",
      TEST_POSTGRES_URL: suite === "unit" ? "" : process.env.TEST_POSTGRES_URL,
      TEST_DATABASE_PREFIX: suite === "unit" ? "" : process.env.TEST_DATABASE_PREFIX,
      EMAIL_MODE: "log",
      BETTER_AUTH_SECRET: "csk-test-secret-for-local-tests-only",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "test",
      VAPID_PRIVATE_KEY: "test"
    }
    return (
      await command(
        [
          process.execPath,
          "test",
          "--no-orphans",
          "--isolate",
          "--dots",
          ...selected.map((file) => `./${file}`),
          ...flags
        ],
        false,
        env
      )
    ).code
  }

  try {
    if (kind !== "db") {
      const code = await tests("unit")
      if (code !== 0 || kind === "unit" || interrupted) return code || interrupted
    }
    const project = `csk-tests-${crypto.randomUUID().slice(0, 12)}`
    const compose = ["docker", "compose", "-p", project, "-f", "test/compose.yml"]
    const supplied = process.env.TEST_POSTGRES_URL !== undefined
    if (!supplied) {
      // No resources exist yet; a missing daemon must not become a cleanup failure.
      try {
        await command(["docker", "info", "--format", "{{.ServerVersion}}"], true)
      } catch (error) {
        throw new Error(
          "Docker is unavailable in the selected context. Check docker context ls and select your running engine, " +
            "or start Docker Desktop (or your Docker daemon) and retry, " +
            "or set TEST_POSTGRES_URL to a local PostgreSQL server with CREATEDB privilege.\n" +
            describeError(error)
        )
      }
    }
    let ready = false
    let failure: unknown
    let failed = false
    let databaseCode = 1
    process.env.TEST_DATABASE_PREFIX = `csk_hub_test_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}_`
    if (process.env.TEST_VERBOSE === "1") console.error(`Database test run: ${process.env.TEST_DATABASE_PREFIX}`)
    try {
      if (!supplied) {
        await command([...compose, "up", "-d", "--wait", "--wait-timeout", "60"], true)
        const { stdout } = await command([...compose, "port", "postgres", "5432"], true)
        const port = stdout.trim().match(/^127\.0\.0\.1:(\d+)$/)?.[1]
        if (!port) throw new Error("Could not determine the test PostgreSQL port")
        process.env.TEST_POSTGRES_URL = `postgresql://csk_test:csk_test@127.0.0.1:${port}/postgres`
      }
      const { url } = databaseTestConnection()
      await withAdmin(url, async (admin) => {
        const { rows } = await admin.query<{ allowed: boolean }>(
          "SELECT rolcreatedb OR rolsuper AS allowed FROM pg_roles WHERE rolname = current_user"
        )
        if (!rows[0]?.allowed) throw new Error("Test PostgreSQL role needs CREATEDB privilege")
      })
      ready = true
      databaseCode = await tests("db")
    } catch (error) {
      failed = true
      failure = error
    }
    {
      // Run even after child failure or interruption; errors here must make the command fail.
      const cleanupErrors: unknown[] = []
      try {
        if (ready) await cleanupTestDatabases()
      } catch (error) {
        cleanupErrors.push(error)
      }
      try {
        if (!supplied) await command([...compose, "down", "--volumes", "--remove-orphans"], true, process.env, true)
      } catch (error) {
        cleanupErrors.push(error)
      }
      if (cleanupErrors.length) {
        throw new AggregateError(failed ? [failure, ...cleanupErrors] : cleanupErrors, "Test runner cleanup failed")
      }
    }
    if (failed) throw failure
    return databaseCode || interrupted
  } finally {
    process.off("SIGINT", onInt)
    process.off("SIGTERM", onTerm)
  }
}

if (import.meta.main) {
  try {
    process.exitCode = await main()
  } catch (error) {
    console.error(describeError(error))
    process.exitCode = 1
  }
}

function describeError(error: unknown): string {
  if (error instanceof AggregateError) return `${error.message}:\n${error.errors.map(describeError).join("\n")}`
  return error instanceof Error ? error.message : "Test run failed"
}
