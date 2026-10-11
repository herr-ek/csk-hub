import { describe, expect, test } from "bun:test"
import { databaseTestConnection } from "./database-config"
import { selectTestFiles } from "./run"

const prefix = "csk_hub_test_012345abcdef_"

describe("database test configuration", () => {
  test("requires explicit test configuration, regardless of the application URL", () => {
    expect(() => databaseTestConnection({ POSTGRES_URL: "postgresql://localhost/development" })).toThrow(
      "TEST_POSTGRES_URL is required"
    )
  })

  test("accepts only local PostgreSQL and a run-owned prefix", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      const url = `postgresql://tester@${host}:5432/postgres`
      expect(databaseTestConnection({ TEST_POSTGRES_URL: url, TEST_DATABASE_PREFIX: prefix })).toEqual({ url, prefix })
    }
    expect(() => databaseTestConnection({ TEST_POSTGRES_URL: "postgresql://localhost/postgres" })).toThrow(
      "run-specific prefix"
    )
  })

  test("rejects remote hosts, connection overrides, malformed URLs and unsafe prefixes", () => {
    for (const url of [
      "postgresql://secret@db.example.com/postgres",
      "postgresql://localhost/postgres?host=db.example.com",
      "postgresql://localhost/postgres?options=-csearch_path%3Dpublic",
      "https://localhost/postgres",
      "invalid"
    ]) {
      expect(() => databaseTestConnection({ TEST_POSTGRES_URL: url, TEST_DATABASE_PREFIX: prefix })).toThrow(
        "local PostgreSQL URL"
      )
    }
    for (const unsafe of ["csk_hub_test_", "postgres", `${prefix}extra`, `${prefix}"`]) {
      expect(() =>
        databaseTestConnection({ TEST_POSTGRES_URL: "postgresql://localhost/postgres", TEST_DATABASE_PREFIX: unsafe })
      ).toThrow("run-specific prefix")
    }
  })
})

test("test selection separates colocated suites and excludes generated and dependency files", () => {
  const files = [
    "src/a.test.ts",
    "src/a.db.test.ts",
    "scripts/ops/reset.db.test.ts",
    "src/b.test.tsx",
    "node_modules/pkg/a.test.ts",
    ".next/a.test.ts",
    "test/database.ts"
  ]
  expect(selectTestFiles(files, "unit")).toEqual(["src/a.test.ts", "src/b.test.tsx"])
  expect(selectTestFiles(files, "db")).toEqual(["scripts/ops/reset.db.test.ts", "src/a.db.test.ts"])
  expect(selectTestFiles(files, "db", "reset")).toEqual(["scripts/ops/reset.db.test.ts"])
})
