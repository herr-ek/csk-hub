import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import { directMembership } from "@/core/db/schema/org-structure"
import { PositionCode } from "@/core/org-structure"
import { createOrgStructureTestDatabase } from "../test-support"

const database = await createOrgStructureTestDatabase()
const requireAdmin = mock(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
const revalidatePath = mock(() => undefined)
mock.module("@/core/db", () => ({ db: database?.db }))
mock.module("@/core/auth/permissions.server", () => ({ requireAdmin }))
mock.module("next/cache", () => ({ revalidatePath }))

const { assignFluidAppointmentAction, correctFluidAppointmentAction, endFluidAppointmentAction } = await import(
  "./detail/fluid-appointment-actions"
)
const { listAppointmentsForGroup } = await import("../appointments")
const { addDirectMembership, endDirectMembership } = await import("../direct-membership")
const IDLE = { status: "idle" } as const

function form(values: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.append(key, value)
  return data
}

describe.skipIf(!database)("fluid Position Admin actions", () => {
  const t = database as NonNullable<typeof database>
  afterAll(() => t.drop())
  beforeEach(() => {
    requireAdmin.mockClear()
    requireAdmin.mockImplementation(async () => ({ state: "authenticated" as const, userId: "admin-1" }))
    revalidatePath.mockClear()
  })

  test("Admin can correct fluid dates without changing singer Membership, and a refused prerequisite edit is atomic", async () => {
    const choir = await t.groupId("MK")
    const otherChoir = await t.groupId("DK")
    const userId = await t.user()
    expect(await addDirectMembership(t.db, { userId, groupId: choir, startDate: "2055-01-01" })).toMatchObject({
      success: true
    })
    const assigned = await assignFluidAppointmentAction(
      IDLE,
      form({
        userId,
        positionCode: PositionCode.Dirigent,
        contextGroupId: choir,
        startDate: "2055-06-15"
      })
    )
    expect(assigned).toMatchObject({ status: "success" })
    const [appointment] = await listAppointmentsForGroup(t.db, choir)
    expect(appointment).toMatchObject({ positionCode: PositionCode.Dirigent, endDate: null })
    const appointmentId = appointment?.id ?? ""

    expect(
      await correctFluidAppointmentAction(
        IDLE,
        form({
          appointmentId,
          userId,
          positionCode: PositionCode.Notfiskal,
          contextGroupId: choir,
          startDate: "2055-07-01",
          lastDay: ""
        })
      )
    ).toMatchObject({ status: "success" })
    expect(await listAppointmentsForGroup(t.db, choir)).toMatchObject([
      { userId, positionCode: PositionCode.Notfiskal, startDate: "2055-07-01", endDate: null }
    ])

    revalidatePath.mockClear()
    expect(
      await correctFluidAppointmentAction(
        IDLE,
        form({
          appointmentId,
          userId,
          positionCode: PositionCode.Dirigent,
          contextGroupId: otherChoir,
          startDate: "2055-07-01",
          lastDay: ""
        })
      )
    ).toEqual({ status: "error", error: "membership-dependency" })
    expect(await listAppointmentsForGroup(t.db, choir)).toMatchObject([
      { userId, positionCode: PositionCode.Notfiskal }
    ])
    expect(revalidatePath).not.toHaveBeenCalled()

    const [member] = await t.db
      .select({ id: directMembership.id, endDate: directMembership.endDate })
      .from(directMembership)
      .where(and(eq(directMembership.userId, userId), eq(directMembership.groupId, choir)))
    expect(await endDirectMembership(t.db, { membershipId: member.id, endDate: "2055-08-01" })).toMatchObject({
      success: false,
      error: "membership-dependency"
    })
    expect(member.endDate).toBeNull()
    expect(await endFluidAppointmentAction(IDLE, form({ appointmentId, lastDay: "2055-12-31" }))).toMatchObject({
      status: "success"
    })
    expect(
      (await t.db.select().from(directMembership).where(eq(directMembership.id, member.id)))[0]?.endDate
    ).toBeNull()
  })

  test("every fluid appointment action checks the Admin boundary", async () => {
    const denied = new Error("denied")
    requireAdmin.mockImplementation(async () => {
      throw denied
    })
    for (const action of [assignFluidAppointmentAction, correctFluidAppointmentAction, endFluidAppointmentAction])
      await expect(action(IDLE, form({}))).rejects.toBe(denied)
    expect(requireAdmin).toHaveBeenCalledTimes(3)
  })
})
