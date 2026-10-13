import { spyOn } from "bun:test"
import { format } from "node:util"

/** Serial test execution keeps console capture local to the test currently running. */
export async function withTestOutput<T>(name: string, work: () => Promise<T>): Promise<T> {
  const lines: string[] = []
  const spies = (["log", "info", "debug", "warn", "error"] as const).map((method) =>
    spyOn(console, method).mockImplementation((...args: unknown[]) => {
      lines.push(format(...args))
    })
  )
  let failed = false
  try {
    return await work()
  } catch (error) {
    failed = true
    throw error
  } finally {
    for (const spy of spies) spy.mockRestore()
    if (lines.length && (failed || process.env.TEST_VERBOSE === "1")) {
      console.error(`\nOutput from ${name}:\n${lines.join("\n")}\n`)
    }
  }
}
