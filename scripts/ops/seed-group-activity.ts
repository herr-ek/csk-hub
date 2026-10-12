import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import { group, groupMember, groupTypePosition, position, positionHolder } from "@/core/db/schema/org-structure"
import { SEED_USERS, type SeedDatabase, seedId } from "./seed-data"

type GroupType = typeof group.$inferInsert.type
type ExampleGroup = { name: string; type: GroupType; choir?: string; archived?: boolean }

const EXAMPLES: ExampleGroup[] = [
  { name: "Styret 26/27", type: "Board" },
  { name: "Styret 24/25", type: "Board", archived: true },
  { name: "Rekryteringskommittén", type: "Rekryteringskommitté" },
  { name: "Turnékommittén 2027", type: "Turnékommitté" },
  { name: "Webmästeriet", type: "Webmästeri" },
  { name: "Föräldramötet", type: "Föräldramötet" },
  { name: "Arkivet", type: "Arkivarie" },
  { name: "Utantillkommittén", type: "Utantillkommitté" },
  { name: "Jubileumskommittén 2025", type: "Övrig", archived: true },
  { name: "Giggrupp julkonsert 2025", type: "GigGroup", archived: true },
  ...["MK", "DK", "KK"].map((choir) => ({
    name: `${choir} rephelg hösten 2025`,
    type: "Rephelg" as const,
    choir,
    archived: true
  }))
]

const EXTRA_POSITIONS: { name: string; types: GroupType[] }[] = [
  { name: "Sammankallande", types: ["Valberedning", "Rekryteringskommitté", "Övrig"] },
  { name: "Roddansvarig", types: ["Roddgrupp"] },
  { name: "Festansvarig", types: ["Festgrupp"] },
  { name: "Rephelgsansvarig", types: ["Rephelg"] },
  { name: "Gigledare", types: ["GigGroup"] },
  { name: "Webbansvarig", types: ["Webmästeri"] },
  { name: "Arkivansvarig", types: ["Arkivarie"] },
  { name: "Utantillansvarig", types: ["Utantillkommitté"] }
]

/** Adds dated demo activity only for seed identities; existing people's Memberships are left alone. */
export async function seedGroupActivity(database: SeedDatabase): Promise<string[]> {
  const created: string[] = []
  const choirs = await database
    .select()
    .from(group)
    .where(and(eq(group.type, "Choir"), eq(group.active, true)))
  for (const example of EXAMPLES) {
    const choirId = example.choir ? choirs.find(({ name }) => name === example.choir)?.id : null
    if (example.choir && !choirId) throw new Error(`Choir ${example.choir} is missing.`)
    const id = seedId(`group:${example.choir ?? "CSK"}:${example.name}`)
    const [existing] = await database
      .select()
      .from(group)
      .where(
        example.archived
          ? eq(group.id, id)
          : and(
              eq(group.name, example.name),
              eq(group.active, true),
              choirId ? eq(group.choirId, choirId) : isNull(group.choirId)
            )
      )
    if (existing) {
      if (existing.type !== example.type) throw new Error(`Example group ${example.name} has a different type.`)
      continue
    }
    await database
      .insert(group)
      .values({ id, name: example.name, type: example.type, choirId, active: !example.archived })
    created.push(example.name)
  }
  for (const example of EXTRA_POSITIONS) {
    await database
      .insert(position)
      .values({ id: seedId(`position:${example.name}`), name: example.name })
      .onConflictDoNothing({ target: position.name })
    const [row] = await database.select().from(position).where(eq(position.name, example.name))
    if (!row) throw new Error(`Position ${example.name} is missing.`)
    await database
      .insert(groupTypePosition)
      .values(example.types.map((type) => ({ type, positionId: row.id })))
      .onConflictDoNothing()
  }

  const singers = await database
    .select({ userId: user.id, groupId: groupMember.groupId })
    .from(user)
    .innerJoin(groupMember, eq(groupMember.userId, user.id))
    .where(
      and(
        inArray(
          user.id,
          SEED_USERS.map(({ id }) => id)
        ),
        isNull(groupMember.endDate),
        eq(user.banned, false)
      )
    )
  const pool = SEED_USERS.filter(({ id }) => singers.some(({ userId }) => userId === id)).map(({ id }) => id)
  if (pool.length < 32) return created

  const groups = await database.select().from(group).orderBy(asc(group.id))
  const positions = await database.select().from(position).orderBy(asc(position.name))
  const allowed = await database.select().from(groupTypePosition)
  const positionId = (name: string) => {
    const row = positions.find((row) => row.name === name)
    if (!row) throw new Error(`Position ${name} is missing; run \`bun run ops reference-data\` first.`)
    return row.id
  }
  const named = (name: string) => {
    const row = groups.find((row) => row.name === name && row.active)
    if (!row) throw new Error(`Group ${name} is missing.`)
    return row
  }
  const membersOf = (groupId: string) =>
    pool.filter((id) => singers.some((row) => row.userId === id && row.groupId === groupId))

  // Helper memberships, former members, rejoining members, and Position handovers in committees.
  const demoNames = new Set([
    "Sexmästeri",
    "Konsertmästeri",
    "Valberedningen",
    "Jubileumskommittén",
    "Giggrupp vår",
    "Gigmästeri",
    ...EXAMPLES.map(({ name }) => name),
    ...["MK", "DK", "KK"].flatMap((choir) => [`${choir} roddgrupp`, `${choir} festgrupp`, `${choir} rephelgsgrupp`])
  ])
  for (const [index, row] of groups.filter((row) => demoNames.has(row.name) && row.type !== "Board").entries()) {
    const candidates = row.choirId ? membersOf(row.choirId) : pool
    if (candidates.length < 8) continue
    const rotated = [...candidates.slice(index % candidates.length), ...candidates.slice(0, index % candidates.length)]
    const current = rotated.slice(0, 6)
    for (const [memberIndex, userId] of current.entries()) {
      if (!row.active) {
        await membership(database, userId, row.id, "2025-09-01", "2026-01-15")
      } else {
        if (memberIndex === 0) await membership(database, userId, row.id, "2025-09-01", "2025-12-01")
        await membership(database, userId, row.id, memberIndex % 2 ? "2026-02-01" : "2026-01-15")
      }
    }
    for (const userId of rotated.slice(6, 8)) await membership(database, userId, row.id, "2025-09-01", "2026-01-15")
    const titles = allowed
      .filter(({ type }) => type === row.type)
      .map(({ positionId }) => positionId)
      // Choir-specific Gigmästare and linked Board offices are assigned explicitly below.
      .filter((id) => !positions.find((position) => position.id === id)?.name.startsWith("Gigmästare "))
    for (const [titleIndex, id] of titles.entries()) {
      const title = positions.find((position) => position.id === id)?.name
      const linked =
        (row.type === "Sexmästeri" && title === "Sexmästare") ||
        (row.type === "Gigmästeri" && title === "Gigmästare") ||
        (row.type === "Konsertmästeri" && title === "1:a Konsertmästare")
      await holding(database, rotated[6] as string, row.id, id, "2025-09-15", row.active ? "2026-01-15" : "2025-11-15")
      await holding(
        database,
        current[titleIndex % current.length] as string,
        row.id,
        id,
        row.active ? "2026-03-01" : "2025-11-15",
        row.active ? (linked ? "2026-07-01" : null) : "2026-01-15"
      )
    }
  }

  // Each Choir has responsibility holders; one singer deliberately holds two independent Positions.
  for (const choir of choirs.filter(({ name }) => ["MK", "DK", "KK"].includes(name))) {
    const members = membersOf(choir.id)
    if (members.length < 5) continue
    for (const [index, title] of ["Dirigent", "Notfiskal", "Konsertmästare", `Gigmästare ${choir.name}`].entries()) {
      const id = positionId(title)
      const current = members[index === 2 ? 2 : index + 1] as string
      await holding(database, members[0] as string, choir.id, id, "2026-03-01", "2026-07-01")
      await holding(database, current, choir.id, id, "2026-07-01")
      if (title.startsWith("Gigmästare ")) {
        const gigmasteri = named("Gigmästeri")
        await membership(database, current, gigmasteri.id, "2026-07-01")
        await holding(database, current, gigmasteri.id, id, "2026-07-01")
      }
    }
  }
  for (const row of groups.filter((row) => row.type === "Section" && row.active)) {
    const members = membersOf(row.id)
    if (members.length < 2) continue
    const id = positionId("Stämförälder")
    await holding(database, members[0] as string, row.id, id, "2026-03-01", "2026-07-01")
    await holding(database, members[1] as string, row.id, id, "2026-07-01")
    const parents = named("Föräldramötet")
    await membership(database, members[1] as string, parents.id, "2026-07-01")
  }

  const board = named("Styret 26/27")
  const oldBoard = groups.find((row) => row.id === seedId("group:CSK:Styret 24/25"))
  if (!oldBoard) throw new Error("The archived Board is missing.")
  const offices = [
    "Ordförande",
    "Vice Ordförande",
    "Kassör",
    "Sekreterare",
    "PR-mästare",
    "1:a Konsertmästare",
    "Gigmästare",
    "Sexmästare"
  ]
  for (const [index, title] of offices.entries()) {
    const current = pool[index] as string
    const former = pool[index + 20] as string
    await membership(database, current, board.id, "2026-07-01")
    await holding(database, current, board.id, positionId(title), "2026-07-01")
    await membership(database, former, oldBoard.id, "2024-09-01", "2025-07-01")
    await holding(database, former, oldBoard.id, positionId(title), "2024-09-01", "2025-07-01")
    const linked = new Map([
      ["1:a Konsertmästare", "Konsertmästeri"],
      ["Gigmästare", "Gigmästeri"],
      ["Sexmästare", "Sexmästeri"]
    ]).get(title)
    if (linked) {
      const target = named(linked)
      const id = positionId(title)
      await membership(database, current, target.id, "2026-07-01")
      await holding(database, current, target.id, id, "2026-07-01")
    }
  }
  return created
}

async function membership(
  database: SeedDatabase,
  userId: string,
  groupId: string,
  startDate: string,
  endDate: string | null = null
) {
  if (!endDate) {
    const [current] = await database
      .select()
      .from(groupMember)
      .where(and(eq(groupMember.userId, userId), eq(groupMember.groupId, groupId), isNull(groupMember.endDate)))
    if (current) return
  }
  await database
    .insert(groupMember)
    .values({ userId, groupId, startDate, endDate })
    .onConflictDoNothing({ target: [groupMember.userId, groupMember.groupId, groupMember.startDate] })
}

async function holding(
  database: SeedDatabase,
  userId: string,
  groupId: string,
  positionId: string,
  startDate: string,
  endDate: string | null = null
) {
  await database
    .insert(positionHolder)
    .values({ userId, groupId, positionId, startDate, endDate })
    .onConflictDoNothing({
      target: [positionHolder.userId, positionHolder.groupId, positionHolder.positionId, positionHolder.startDate]
    })
}
