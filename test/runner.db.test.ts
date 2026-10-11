import { expect, test } from "bun:test"
import { withAdmin } from "./database"
import { databaseTestConnection } from "./database-config"

// Exercises the actual CLI and its child process. This test itself owns no database fixture.
test("SIGTERM stops the child and removes databases owned by that interrupted run", async () => {
  const { url } = databaseTestConnection()
  const child = Bun.spawn(
    [
      process.execPath,
      "run",
      "test/run.ts",
      "db",
      "--file",
      "org-structure/structure",
      "--rerun-each",
      "100",
      "--verbose"
    ],
    { env: { ...process.env, TEST_POSTGRES_URL: url }, stdout: "pipe", stderr: "pipe" }
  )
  let output = ""
  async function collect(stream: ReadableStream<Uint8Array>) {
    const decoder = new TextDecoder()
    for await (const chunk of stream) output += decoder.decode(chunk, { stream: true })
  }
  const readers = Promise.all([collect(child.stdout), collect(child.stderr)])
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    let prefix: string | undefined
    let created = false
    const until = Date.now() + 15_000
    while (!created && Date.now() < until) {
      prefix = output.match(/Database test run: (csk_hub_test_[a-f0-9]{12}_)/)?.[1]
      if (prefix) {
        created = await withAdmin(url, async (admin) => {
          const { rows } = await admin.query<{ exists: boolean }>(
            "SELECT EXISTS (SELECT 1 FROM pg_database WHERE left(datname, length($1)) = $1) AS exists",
            [prefix]
          )
          return rows[0].exists
        })
      }
      if (!created) await Bun.sleep(25)
    }
    if (!created || !prefix) throw new Error(`Nested test process did not create a database:\n${output}`)
    child.kill("SIGTERM")
    const code = await Promise.race([
      child.exited,
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new Error("Interrupted runner did not exit")), 10_000)
      })
    ])
    expect(code).toBe(143)
    const remaining = await withAdmin(url, async (admin) => {
      const { rows } = await admin.query<{ datname: string }>(
        "SELECT datname FROM pg_database WHERE left(datname, length($1)) = $1",
        [prefix]
      )
      return rows
    })
    expect(remaining).toEqual([])
  } finally {
    clearTimeout(deadline)
    if (child.exitCode === null) child.kill("SIGKILL")
    await child.exited
    await readers
  }
}, 60_000)
