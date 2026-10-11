import { describe, expect } from "bun:test"
import { spawnSync } from "node:child_process"
import type { TestDatabase } from "@test/database"
import { databaseTest } from "@test/database-test"
import { and, eq } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import {
  choir,
  group,
  groupMember,
  groupTypePosition,
  position,
  positionGroup,
  section
} from "@/core/db/schema/org-structure"
import { ORG_STRUCTURE, populateOrgStructure, seedOrgStructure } from "./seed-org-structure"

const test = databaseTest()

async function newUser(t: TestDatabase, banned = false) {
  const id = crypto.randomUUID()
  await t.db.insert(user).values({ id, name: "Singer", email: `${id}@example.com`, banned })
  return id
}

function runCommand(t: TestDatabase, ...args: string[]) {
  const result = spawnSync(process.execPath, ["run", "scripts/ops/index.ts", ...args], {
    env: { ...process.env, POSTGRES_URL: t.url, POSTGRES_URL_PROD: t.url },
    encoding: "utf8",
    timeout: 10_000
  })
  console.log(result.stdout, result.stderr)
  expect(result.error).toBeUndefined()
  return result
}

describe("organisation structure", () => {
  test("creates the Choirs, their Sections and Voices, the Board and the Positions", async (t) => {
    const { created } = await populateOrgStructure(t.db, { localExamples: false })
    expect(created).toContain("KKB")
    expect(created).toContain("Stämförälder")

    for (const definition of ORG_STRUCTURE.choirs) {
      const [choirRow] = await t.db
        .select({ id: group.id })
        .from(group)
        .where(and(eq(group.name, definition.name), eq(group.type, "Choir")))
      const sections = await t.db
        .select({ name: group.name, voice: section.voice })
        .from(section)
        .innerJoin(group, eq(group.id, section.groupId))
        .where(eq(group.choirId, choirRow?.id as string))
      expect(sections.map(({ name, voice }) => `${name}:${voice}`).sort()).toEqual(
        definition.sections.map(({ name, voice }) => `${name}:${voice}`).sort()
      )
    }
    expect(await t.db.select().from(choir)).toHaveLength(ORG_STRUCTURE.choirs.length)

    for (const { name, type } of ORG_STRUCTURE.groups) {
      const [row] = await t.db.select().from(group).where(eq(group.name, name))
      expect(row).toMatchObject({ type, choirId: null })
    }

    const allowed = await t.db
      .select({ name: position.name, type: groupTypePosition.type })
      .from(groupTypePosition)
      .innerJoin(position, eq(position.id, groupTypePosition.positionId))
    expect(allowed.map(({ name, type }) => `${name}:${type}`).sort()).toEqual(
      ORG_STRUCTURE.positions.flatMap(({ name, groupTypes }) => groupTypes.map((type) => `${name}:${type}`)).sort()
    )
    const limits = await t.db
      .select({ name: position.name, group: group.name })
      .from(positionGroup)
      .innerJoin(position, eq(position.id, positionGroup.positionId))
      .innerJoin(group, eq(group.id, positionGroup.groupId))
    expect(limits.map(({ name, group }) => `${name}:${group}`).sort()).toEqual(
      ORG_STRUCTURE.positions.flatMap(({ name, groups = [] }) => groups.map((group) => `${name}:${group}`)).sort()
    )
  })

  test("is safe to run again", async (t) => {
    await populateOrgStructure(t.db, { localExamples: false })
    expect(await populateOrgStructure(t.db, { localExamples: false })).toEqual({ created: [], placed: 0 })
    const sections = ORG_STRUCTURE.choirs.flatMap(({ sections }) => sections)
    expect(await t.db.select().from(group)).toHaveLength(
      ORG_STRUCTURE.choirs.length + sections.length + ORG_STRUCTURE.groups.length
    )
  })

  test("one local command seeds an empty database and places users without a prerequisite seed", async (t) => {
    const users = await Promise.all(Array.from({ length: 20 }, () => newUser(t)))
    const banned = await newUser(t, true)
    expect(runCommand(t, "seed-org-structure").status).toBe(0)
    const names = (await t.db.select().from(group)).map(({ name }) => name)
    expect(names).toContain("KKB")
    expect(names).toContain("Sexmästeri")
    expect(names).toContain("KK roddgrupp")
    expect(names).toHaveLength(31)

    for (const userId of users) {
      const rows = await t.db
        .select({ type: group.type, voice: groupMember.voice, choirId: group.choirId, groupId: group.id })
        .from(groupMember)
        .innerJoin(group, eq(group.id, groupMember.groupId))
        .where(eq(groupMember.userId, userId))
      expect(rows.map(({ type }) => type).sort()).toEqual(["Choir", "Section"])
      const sectionRow = rows.find(({ type }) => type === "Section")
      expect(sectionRow?.voice).toMatch(/^[SATB][12]$/)
      expect(sectionRow?.choirId).toBe(rows.find(({ type }) => type === "Choir")?.groupId)
      const [voiceRow] = await t.db
        .select()
        .from(section)
        .where(eq(section.groupId, sectionRow?.groupId as string))
      expect(sectionRow?.voice?.startsWith(voiceRow?.voice as string)).toBe(true)
    }
    expect(await t.db.select().from(groupMember).where(eq(groupMember.userId, banned))).toEqual([])

    const memberships = await t.db.select().from(groupMember)
    expect(await populateOrgStructure(t.db, { localExamples: true })).toEqual({ created: [], placed: 0 })
    expect(await t.db.select().from(groupMember)).toEqual(memberships)
    const added = await newUser(t)
    expect(await populateOrgStructure(t.db, { localExamples: true })).toEqual({ created: [], placed: 1 })
    expect(await t.db.select().from(groupMember).where(eq(groupMember.userId, added))).toHaveLength(2)
  })

  test("preserves membership history instead of reassigning a previously placed user", async (t) => {
    const id = await newUser(t)
    await populateOrgStructure(t.db, { localExamples: true })
    await t.db.update(groupMember).set({ endDate: "2025-08-26" }).where(eq(groupMember.userId, id))
    const history = await t.db.select().from(groupMember)
    expect(await populateOrgStructure(t.db, { localExamples: true })).toEqual({ created: [], placed: 0 })
    expect(await t.db.select().from(groupMember)).toEqual(history)
  })

  test("rolls back shared structure and local examples together when a later group conflicts", async (t) => {
    await t.db.insert(group).values({ name: "Sexmästeri", type: "Övrig" })
    await newUser(t)
    await expect(populateOrgStructure(t.db, { localExamples: true })).rejects.toThrow("expected Sexmästeri")
    expect((await t.db.select().from(group)).map(({ name }) => name)).toEqual(["Sexmästeri"])
    expect(await t.db.select().from(choir)).toEqual([])
    expect(await t.db.select().from(section)).toEqual([])
    expect(await t.db.select().from(position)).toEqual([])
    expect(await t.db.select().from(groupMember)).toEqual([])
  })

  test("serializes concurrent runs without duplicating structure or memberships", async (t) => {
    await newUser(t)
    const results = await Promise.all([
      populateOrgStructure(t.db, { localExamples: true }),
      populateOrgStructure(t.db, { localExamples: true })
    ])
    expect(results.map(({ placed }) => placed).sort()).toEqual([0, 1])
    expect(results.map(({ created }) => created.length).filter((length) => length === 0)).toHaveLength(1)
    expect(await t.db.select().from(group)).toHaveLength(31)
    expect(await t.db.select().from(groupMember)).toHaveLength(2)
  })

  test("the production command seeds shared structure without example groups or user placement", async (t) => {
    await newUser(t)
    expect(runCommand(t, "seed-org-structure", "--prod", "--yes").status).toBe(0)
    expect((await t.db.select().from(group)).map(({ name }) => name)).toContain("KKB")
    expect(await t.db.select().from(group)).toHaveLength(17)
    expect(await t.db.select().from(groupMember)).toEqual([])
  })

  test("refuses unattended production writes without confirmation", async (t) => {
    const result = runCommand(t, "seed-org-structure", "--prod")
    expect(result.status).toBe(1)
    expect(result.stderr).toContain("needs confirmation")
    expect(await t.db.select().from(group)).toEqual([])
  })

  test("refuses a remote URL when the target is local", async () => {
    expect(
      await seedOrgStructure(
        { target: "local", url: "postgresql://someone@db.example.com:5432/csk_hub", host: "remote" },
        { skipConfirmation: true }
      )
    ).toBe(1)
  })
})
