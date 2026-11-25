import "server-only"

import { and, asc, eq, gt, isNull } from "drizzle-orm"
import { directMembership, group, positionAppointment } from "@/core/db/schema/org-structure"
import {
  currentOrganisationYear,
  GROUP_POLICIES,
  GroupType,
  type IsoDate,
  type OrgStructureResult,
  POSITION_DEFINITIONS,
  type PositionCode
} from "@/core/org-structure"
import type { VoiceDivision, VoiceFamily } from "@/features/voice/model"
import { replaceAppointmentHolder } from "./appointments"
import { addDirectMembership, changeDirectMembership, removeDirectMembership } from "./direct-membership"
import { cskToday } from "./effective-reads"
import { prepareOrganisationYear } from "./group-management"
import { requireGroup } from "./lookup"
import {
  type OrgStructureDatabase,
  type OrgStructureTransaction,
  RuleViolation,
  requireDate,
  runOrgStructureCommand
} from "./operation"

/**
 * Fills one Position, replacing whoever holds it from `startDate`. `contextGroupId` names the Choir,
 * Section or gig group; an annual Group's Position is found by its year instead, and the first Position
 * filled in the current or next year sets up that whole year. Without an end date the tenure runs to the
 * next planned holder, else to the end of the year, else on. Pass the holder being swapped in `replaces`.
 */
export function fillPosition(
  database: OrgStructureDatabase,
  input: {
    userId: string
    positionCode: PositionCode
    contextGroupId?: string
    organisationYear?: number
    startDate: IsoDate
    endDate?: IsoDate
    replaces?: string
  },
  today: IsoDate = cskToday()
) {
  return runOrgStructureCommand(database, async (tx) => {
    const startDate = requireDate(input.startDate)
    const definition = POSITION_DEFINITIONS[input.positionCode]
    const annual = definition.endPolicy === "annual"
    if (annual !== (input.organisationYear !== undefined)) throw new RuleViolation("period-conflict")
    if (input.organisationYear !== undefined) await ensureYear(tx, input.organisationYear, today)
    const contextGroupId =
      GROUP_POLICIES[definition.context].lifetime === "annual"
        ? await annualGroupId(tx, definition.context, input.organisationYear as number)
        : input.contextGroupId
    if (!contextGroupId) throw new RuleViolation("group-not-found")
    const [next] = await tx
      .select({ startDate: positionAppointment.startDate })
      .from(positionAppointment)
      .where(
        and(
          eq(positionAppointment.contextGroupId, contextGroupId),
          eq(positionAppointment.positionCode, input.positionCode),
          annual
            ? eq(positionAppointment.organisationYear, input.organisationYear as number)
            : isNull(positionAppointment.organisationYear),
          gt(positionAppointment.startDate, startDate)
        )
      )
      .orderBy(asc(positionAppointment.startDate))
      .limit(1)
    return succeed(
      await replaceAppointmentHolder(
        tx,
        { ...input, contextGroupId, startDate, endDate: input.endDate ?? next?.startDate },
        today
      )
    )
  })
}

type NewMember = { userId: string; voiceFamily?: VoiceFamily }

/**
 * Adds several people to a Group at once. An annual committee is named by its type and year, and the
 * first person added to the current or next year sets up that whole year. All are added, or none.
 */
export function addGroupMembers(
  database: OrgStructureDatabase,
  input: {
    target: { groupId: string } | { type: GroupType; organisationYear: number }
    members: NewMember[]
    startDate: IsoDate
    endDate?: IsoDate
  },
  today: IsoDate = cskToday()
) {
  return runOrgStructureCommand(database, async (tx) => {
    let groupId: string
    if ("groupId" in input.target) groupId = input.target.groupId
    else {
      const { type, organisationYear } = input.target
      if (GROUP_POLICIES[type].lifetime !== "annual") throw new RuleViolation("group-not-found")
      await ensureYear(tx, organisationYear, today)
      groupId = await annualGroupId(tx, type, organisationYear)
    }
    for (const member of inLockOrder(input.members))
      succeed(
        await addDirectMembership(tx, {
          ...member,
          groupId,
          startDate: input.startDate,
          endDate: input.endDate
        })
      )
    return { groupId }
  })
}

/**
 * Changes a gig group's line-up in one go: leavers are gone and joiners are in from `date`, and changed
 * Voices apply to the existing memberships. A leaving Gigledare stops leading. All of it happens, or none.
 */
export function refillGigGroup(
  database: OrgStructureDatabase,
  input: {
    groupId: string
    date: IsoDate
    leave: string[]
    voices: { membershipId: string; voice: VoiceDivision }[]
    join: { userId: string; voice: VoiceDivision }[]
  },
  today: IsoDate = cskToday()
) {
  return runOrgStructureCommand(database, async (tx) => {
    const target = await requireGroup(tx, input.groupId)
    if (target.type !== GroupType.GigGroup) throw new RuleViolation("group-not-found")
    const memberships = await tx
      .select({
        id: directMembership.id,
        userId: directMembership.userId,
        endDate: directMembership.endDate
      })
      .from(directMembership)
      .where(eq(directMembership.groupId, input.groupId))
    const byId = new Map(memberships.map((membership) => [membership.id, membership]))
    const member = (id: string) => {
      const membership = byId.get(id)
      if (!membership) throw new RuleViolation("not-a-member")
      return membership
    }
    type Step = { userId: string; run: () => Promise<OrgStructureResult<unknown>> }
    const steps: Step[] = [
      ...input.leave.map((id) => ({
        userId: member(id).userId,
        run: () => removeDirectMembership(tx, { membershipId: id, date: input.date, endAppointments: true }, today)
      })),
      ...input.voices.map(({ membershipId, voice }) => ({
        userId: member(membershipId).userId,
        run: () =>
          changeDirectMembership(tx, {
            membershipId,
            groupId: input.groupId,
            date: input.date,
            endDate: member(membershipId).endDate,
            voice
          })
      })),
      ...input.join.map(({ userId, voice }) => ({
        userId,
        run: () => addDirectMembership(tx, { userId, groupId: input.groupId, startDate: input.date, voice })
      }))
    ]
    for (const step of inLockOrder(steps)) succeed(await step.run())
    return { id: input.groupId }
  })
}

/** Sets up the annual Groups of the current or next year when they are missing; an earlier year is history. */
async function ensureYear(tx: OrgStructureTransaction, year: number, today: IsoDate) {
  if (year < currentOrganisationYear(today)) return
  succeed(await prepareOrganisationYear(tx, year, today))
}

async function annualGroupId(tx: OrgStructureTransaction, type: GroupType, year: number) {
  const [row] = await tx
    .select({ id: group.id })
    .from(group)
    .where(and(eq(group.type, type), eq(group.organisationYear, year)))
  if (!row) throw new RuleViolation("group-not-found")
  return row.id
}

/** Commands lock one User at a time; a stable order keeps concurrent batches from deadlocking. */
function inLockOrder<T extends { userId: string }>(items: T[]) {
  return items.toSorted((a, b) => a.userId.localeCompare(b.userId))
}

function succeed<T>(result: OrgStructureResult<T>): T {
  if (!result.success) throw new RuleViolation(result.error)
  return result.data
}
