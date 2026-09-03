import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { projectFiles } from "archunit"
import { describe, expect, it, test } from "vitest"

const options = {
  logging: {
    enabled: true,
    level: "warn"
  }
} as const

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/** The feature a file belongs to, or null when it sits outside `src/features`. */
function featureOwning(file: string): string | null {
  return relative(process.cwd(), file).match(/^src\/features\/([\w.-]+)\//)?.[1] ?? null
}

/**
 * Subfeature entrypoints are legitimate targets, so a path counts as public when the
 * directory it names has an `index.ts`. Anything else is a deep implementation import.
 */
function isEntrypoint(feature: string, subpath: string): boolean {
  const normalizedSubpath = subpath.replace(/^\/+/, "")
  return existsSync(join("src/features", feature, normalizedSubpath, "index.ts"))
}

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

  test("core does not depend on features", async () => {
    const rule = projectFiles().inPath("src/core/**").shouldNot().dependOnFiles().inPath("src/features/**")
    await expect(rule).toPassAsync(options)
  })

  test("shared does not depend on features", async () => {
    const rule = projectFiles().inPath("src/shared/**").shouldNot().dependOnFiles().inPath("src/features/**")
    await expect(rule).toPassAsync(options)
  })

  test("features are reached only through a public entrypoint", () => {
    const violations = sourceFiles("src").flatMap((file) => {
      const owner = featureOwning(file)
      return [...readFileSync(file, "utf8").matchAll(/from\s+"@\/features\/([\w.-]+)(\/[^"]+)?"/g)]
        .filter(([, feature, subpath]) => feature !== owner && subpath && !isEntrypoint(feature, subpath))
        .map(([, feature, subpath]) => `${relative(process.cwd(), file)} -> @/features/${feature}${subpath}`)
    })

    expect(violations).toEqual([])
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
