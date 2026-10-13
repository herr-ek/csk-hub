import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

for (const failed of [false, true]) {
  test(`captured output is ${failed ? "shown on failure" : "quiet on success"} and console is restored`, async () => {
    const folder = await mkdtemp(join(tmpdir(), "csk-output-"))
    const file = join(folder, "output.test.ts")
    try {
      await writeFile(
        file,
        `import { test } from "bun:test"
import { withTestOutput } from ${JSON.stringify(join(import.meta.dir, "output.ts"))}
test("capture", () => withTestOutput("operation", async () => {
  console.log("captured operation output")
  ${failed ? 'throw new Error("operation failed")' : ""}
}))
test("restored", () => { console.log("restored console output") })`
      )
      const child = Bun.spawn([process.execPath, "test", file], {
        env: { ...process.env, TEST_VERBOSE: "" },
        stdout: "pipe",
        stderr: "pipe"
      })
      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text()
      ])
      const output = stdout + stderr
      expect(code).toBe(failed ? 1 : 0)
      expect(output).toContain("restored console output")
      if (failed) {
        expect(output).toContain("Output from operation:")
        expect(output).toContain("captured operation output")
        expect(output).toContain("operation failed")
      } else {
        expect(output).not.toContain("captured operation output")
      }
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
}
