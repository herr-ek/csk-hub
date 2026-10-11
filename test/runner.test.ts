import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

async function runWithDocker(mode: "unavailable" | "startup-failure" | "cleanup-failure", supplied = false) {
  const folder = await mkdtemp(join(tmpdir(), "csk-runner-"))
  const calls = join(folder, "calls.jsonl")
  try {
    await writeFile(
      join(folder, "docker"),
      `#!${process.execPath}
import { appendFileSync } from "node:fs"
const args = process.argv.slice(2)
appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + "\\n")
if (${JSON.stringify(mode)} === "unavailable") {
  console.error("failed to connect to the docker API: connect: no such file or directory")
  process.exit(1)
}
if (args[0] === "info") {
  process.exit(0)
}
if (args.includes("up")) {
  console.error("PostgreSQL startup failed")
  process.exit(1)
}
if (args.includes("down") && ${JSON.stringify(mode)} === "cleanup-failure") {
  console.error("Compose cleanup failed")
  process.exit(1)
}
`,
      { mode: 0o755 }
    )
    const child = Bun.spawn([process.execPath, "run", "test/run.ts", "db", "--file", "test/database.db"], {
      env: {
        ...process.env,
        PATH: `${folder}:${process.env.PATH}`,
        TEST_POSTGRES_URL: supplied ? "invalid" : undefined
      },
      stdout: "pipe",
      stderr: "pipe"
    })
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text()
    ])
    const recorded = await readFile(calls, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return ""
      throw error
    })
    return {
      code,
      output: stdout + stderr,
      calls: recorded.trim()
        ? recorded
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as string[])
        : []
    }
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
}

test("an unavailable Docker daemon fails before provisioning and reports how to proceed", async () => {
  const { code, output, calls } = await runWithDocker("unavailable")
  expect(code).toBe(1)
  expect(output).toContain("Docker is unavailable")
  expect(output).toContain("docker context ls")
  expect(output).toContain("start Docker Desktop")
  expect(output).toContain("TEST_POSTGRES_URL")
  expect(output).toContain("failed to connect to the docker API")
  expect(output).not.toContain("Test runner cleanup failed")
  expect(calls.map((args) => args[0])).toEqual(["info"])
})

test("failed Compose startup still removes partially provisioned resources", async () => {
  const { code, output, calls } = await runWithDocker("startup-failure")
  expect(code).toBe(1)
  expect(output).toContain("PostgreSQL startup failed")
  expect(output).not.toContain("Test runner cleanup failed")
  expect(calls.filter((args) => args[0] === "compose").map((args) => args[5])).toEqual(["up", "down"])
})

test("a cleanup failure preserves the original startup failure", async () => {
  const { code, output } = await runWithDocker("cleanup-failure")
  expect(code).toBe(1)
  expect(output).toContain("Test runner cleanup failed")
  expect(output).toContain("PostgreSQL startup failed")
  expect(output).toContain("Compose cleanup failed")
})

test("a supplied PostgreSQL URL bypasses Docker entirely", async () => {
  const { code, output, calls } = await runWithDocker("unavailable", true)
  expect(code).toBe(1)
  expect(output).toContain("local PostgreSQL URL")
  expect(output).not.toContain("Docker is unavailable")
  expect(calls).toEqual([])
})
