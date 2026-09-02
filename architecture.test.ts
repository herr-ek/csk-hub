import { projectFiles } from "archunit"
import { describe, expect, it, test } from "vitest"

const options = {
  logging: {
    enabled: true,
    level: "warn"
  }
} as const

describe("Architecture Rules", () => {
  test("core should not depend on app", async () => {
    const rule = projectFiles().inFolder("src/core/**").shouldNot().dependOnFiles().inFolder("src/app")
    await expect(rule).toPassAsync(options)
  })

  it("should not have circular dependencies", async () => {
    const rule = projectFiles().inFolder("src/**").should().haveNoCycles()
    await expect(rule).toPassAsync(options)
  })

  test("shared does not depend on app", async () => {
    const rule = projectFiles().inPath("src/shared/**").shouldNot().dependOnFiles().inPath("src/app/**")
    await expect(rule).toPassAsync(options)
  })

  test("shared does not depend on core", async () => {
    const rule = projectFiles().inPath("src/shared/**").shouldNot().dependOnFiles().inPath("src/core/**")
    await expect(rule).toPassAsync(options)
  })

  test("nothing outside app depends on app", async () => {
    const violations = await projectFiles()
      .inPath("src/**", {
        except: { inPath: "src/app/**" }
      })
      .shouldNot()
      .dependOnFiles()
      .inPath("src/app/**")
      .check()

    expect(violations).toEqual([])
  })
})
