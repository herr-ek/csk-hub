import { afterAll, describe, expect, test } from "bun:test"
import { eq, inArray } from "drizzle-orm"
import { user } from "@/core/db/schema/auth"
import {
  absenceReason,
  event,
  eventAttendance,
  eventRegistration,
  eventRegistrationAnswer,
  eventRegistrationAnswerChoice,
  eventRegistrationQuestion,
  eventRegistrationQuestionOption,
  eventResponse,
  eventTarget,
  gig,
  rehearsal
} from "@/core/db/schema/events"
import { group } from "@/core/db/schema/org-structure"
import { createTestDatabase } from "../../../test/database"

// The constraints and triggers the database enforces by itself for Events, written to directly so
// that no module's checks can mask a missing one. The rules the scheme tags [app] are not tested here.

const database = await createTestDatabase()

describe.skipIf(!database)("events schema constraints", () => {
  const { db, drop } = database as NonNullable<typeof database>
  afterAll(() => drop())

  async function newUser() {
    const id = crypto.randomUUID()
    await db.insert(user).values({ id, name: "Singer", email: `${id}@example.com` })
    return id
  }

  async function newEvent(values: Partial<typeof event.$inferInsert> = {}) {
    const [row] = await db
      .insert(event)
      .values({
        type: "Rehearsal",
        status: "Published",
        title: "KK rep",
        startsAt: new Date("2026-10-07T16:00:00Z"),
        endsAt: new Date("2026-10-07T19:00:00Z"),
        participationMode: "ResponseRequiredStrict",
        ...values
      })
      .returning({ id: event.id })
    return row.id
  }

  async function newQuestion(eventId: string, kind: "Text" | "SingleChoice" | "Checkbox" = "Text") {
    const [row] = await db
      .insert(eventRegistrationQuestion)
      .values({ eventId, label: "Allergies", kind, sortOrder: 1 })
      .returning({ id: eventRegistrationQuestion.id })
    return row.id
  }

  async function newRegistration(eventId: string, userId: string, comment?: string) {
    const [row] = await db
      .insert(eventRegistration)
      .values({ eventId, userId, comment })
      .returning({ id: eventRegistration.id })
    return row.id
  }

  const socialEvent = { type: "Social", participationMode: "Registration" } as const

  describe("Events", () => {
    test("rejects an Event that ends before it starts, or is called after it starts", async () => {
      await expect(newEvent({ endsAt: new Date("2026-10-07T16:00:00Z") })).rejects.toMatchObject({
        cause: { constraint: "event_period_check" }
      })
      await expect(newEvent({ callTime: new Date("2026-10-07T16:30:00Z") })).rejects.toMatchObject({
        cause: { constraint: "event_call_time_check" }
      })
      await newEvent({ callTime: new Date("2026-10-07T15:30:00Z") })
    })

    test("rejects a deadline after the start, or on an Event that collects nothing", async () => {
      await expect(newEvent({ respondBy: new Date("2026-10-08T00:00:00Z") })).rejects.toMatchObject({
        cause: { constraint: "event_respond_by_check" }
      })
      await expect(
        newEvent({ type: "Booking", participationMode: "None", respondBy: new Date("2026-10-01T00:00:00Z") })
      ).rejects.toMatchObject({ cause: { constraint: "event_respond_by_mode_check" } })
    })

    test("attaches an extension row only to an Event of its type, and then pins the type", async () => {
      const gigId = await newEvent({ type: "Gig", participationMode: "ResponseRequired" })
      await expect(db.insert(rehearsal).values({ eventId: gigId }).execute()).rejects.toMatchObject({
        cause: { constraint: "rehearsal_event_id_type_event_id_type_fk" }
      })
      await db.insert(gig).values({ eventId: gigId, contactName: "Eva Berg" })

      await expect(
        db.update(event).set({ type: "Concert" }).where(eq(event.id, gigId)).execute()
      ).rejects.toMatchObject({ cause: { constraint: "gig_event_id_type_event_id_type_fk" } })
    })

    test("deletes a Draft with its extension row, targets and details", async () => {
      const eventId = await newEvent({ status: "Draft" })
      await db.insert(rehearsal).values({ eventId })
      await db.insert(eventTarget).values({ eventId, voiceFamily: "B" })

      await db.delete(event).where(eq(event.id, eventId))
      expect(await db.select().from(rehearsal).where(eq(rehearsal.eventId, eventId))).toEqual([])
    })
  })

  describe("Targets", () => {
    test("needs a group, a Voice family or both", async () => {
      const eventId = await newEvent()
      await expect(db.insert(eventTarget).values({ eventId }).execute()).rejects.toMatchObject({
        cause: { constraint: "event_target_not_empty_check" }
      })
    })

    test("takes a Voice family, never a division", async () => {
      const eventId = await newEvent()
      await expect(
        db
          .insert(eventTarget)
          .values({ eventId, voiceFamily: "B1" as "B" })
          .execute()
      ).rejects.toMatchObject({ cause: { constraint: "voice_family_check" } })
    })

    test("rejects the same rule twice, also when one side is empty", async () => {
      const eventId = await newEvent()
      const [kk] = await db.insert(group).values({ name: "KK targets", type: "GigGroup" }).returning({ id: group.id })
      await db.insert(eventTarget).values([
        { eventId, voiceFamily: "B" },
        { eventId, groupId: kk.id },
        { eventId, groupId: kk.id, voiceFamily: "B" }
      ])

      for (const target of [{ voiceFamily: "B" as const }, { groupId: kk.id }]) {
        await expect(
          db
            .insert(eventTarget)
            .values({ eventId, ...target })
            .execute()
        ).rejects.toMatchObject({
          cause: { constraint: "event_target_unique" }
        })
      }
    })
  })

  describe("Responses", () => {
    test("go only to Published Events in a response mode", async () => {
      const userId = await newUser()
      for (const values of [{ status: "Draft" }, { status: "Cancelled" }, socialEvent] as const) {
        const eventId = await newEvent(values)
        await expect(
          db.insert(eventResponse).values({ eventId, userId, answer: "Yes" }).execute()
        ).rejects.toMatchObject({ cause: { constraint: "event_response_mode_check" } })
      }
    })

    test("are Yes, or No with exactly one reason, in ResponseRequiredStrict", async () => {
      const eventId = await newEvent()
      const [sick] = await db.insert(absenceReason).values({ label: "Sick" }).returning({ id: absenceReason.id })

      for (const values of [{ answer: "Maybe" }, { answer: "No" }, { answer: "No", reasonText: "  " }] as const) {
        await expect(
          db
            .insert(eventResponse)
            .values({ eventId, userId: await newUser(), ...values })
            .execute()
        ).rejects.toMatchObject({ cause: { constraint: "event_response_strict_check" } })
      }
      await expect(
        db
          .insert(eventResponse)
          .values({ eventId, userId: await newUser(), answer: "No", absenceReasonId: sick.id, reasonText: "Flu" })
          .execute()
      ).rejects.toMatchObject({ cause: { constraint: "event_response_one_reason_check" } })

      await db.insert(eventResponse).values([
        { eventId, userId: await newUser(), answer: "Yes" },
        { eventId, userId: await newUser(), answer: "No", absenceReasonId: sick.id },
        { eventId, userId: await newUser(), answer: "No", reasonText: "Moving apartment" }
      ])
    })

    test("take any answer, and a reason only with No, in ResponseRequired", async () => {
      const eventId = await newEvent({ type: "Gig", participationMode: "ResponseRequired" })
      await db.insert(eventResponse).values([
        { eventId, userId: await newUser(), answer: "Maybe" },
        { eventId, userId: await newUser(), answer: "No" }
      ])
      await expect(
        db
          .insert(eventResponse)
          .values({ eventId, userId: await newUser(), answer: "Yes", reasonText: "Exam" })
          .execute()
      ).rejects.toMatchObject({ cause: { constraint: "event_response_reason_only_with_no_check" } })
    })

    test("allow one Response per User and Event", async () => {
      const [eventId, userId] = [await newEvent(), await newUser()]
      await db.insert(eventResponse).values({ eventId, userId, answer: "Yes" })
      await expect(db.insert(eventResponse).values({ eventId, userId, answer: "Yes" }).execute()).rejects.toMatchObject(
        { cause: { constraint: "event_response_event_user_unique" } }
      )
    })

    test("keep the Event in a response mode, though they survive a switch between the two", async () => {
      const eventId = await newEvent({ type: "Gig", participationMode: "ResponseRequired" })
      await db.insert(eventResponse).values({ eventId, userId: await newUser(), answer: "Maybe" })

      for (const participationMode of ["None", "Registration"] as const) {
        await expect(
          db.update(event).set({ participationMode }).where(eq(event.id, eventId)).execute()
        ).rejects.toMatchObject({ cause: { constraint: "event_participation_mode_change_check" } })
      }
      await db.update(event).set({ participationMode: "ResponseRequiredStrict" }).where(eq(event.id, eventId))
    })
  })

  describe("Registrations", () => {
    test("go only to Events in Registration mode, and register only while Published", async () => {
      const userId = await newUser()
      await expect(newRegistration(await newEvent(), userId)).rejects.toMatchObject({
        cause: { constraint: "event_registration_mode_check" }
      })
      await expect(newRegistration(await newEvent({ ...socialEvent, status: "Draft" }), userId)).rejects.toMatchObject({
        cause: { constraint: "event_registration_mode_check" }
      })
    })

    test("can be withdrawn after cancellation, but not renewed", async () => {
      const eventId = await newEvent(socialEvent)
      const registrationId = await newRegistration(eventId, await newUser())
      await db.update(event).set({ status: "Cancelled" }).where(eq(event.id, eventId))

      await db
        .update(eventRegistration)
        .set({ status: "Withdrawn", withdrawnAt: new Date() })
        .where(eq(eventRegistration.id, registrationId))
      await expect(
        db
          .update(eventRegistration)
          .set({ status: "Registered", withdrawnAt: null })
          .where(eq(eventRegistration.id, registrationId))
          .execute()
      ).rejects.toMatchObject({ cause: { constraint: "event_registration_mode_check" } })
    })

    test("carry a withdrawal time exactly while Withdrawn", async () => {
      const eventId = await newEvent(socialEvent)
      await expect(
        db
          .insert(eventRegistration)
          .values({ eventId, userId: await newUser(), status: "Withdrawn" })
          .execute()
      ).rejects.toMatchObject({ cause: { constraint: "event_registration_withdrawn_check" } })
      await expect(
        db
          .insert(eventRegistration)
          .values({ eventId, userId: await newUser(), withdrawnAt: new Date() })
          .execute()
      ).rejects.toMatchObject({ cause: { constraint: "event_registration_withdrawn_check" } })
    })

    test("keep the Event in Registration mode once it has questions", async () => {
      const eventId = await newEvent({ ...socialEvent, status: "Draft" })
      await newQuestion(eventId)
      await expect(
        db.update(event).set({ participationMode: "ResponseRequired" }).where(eq(event.id, eventId)).execute()
      ).rejects.toMatchObject({ cause: { constraint: "event_participation_mode_change_check" } })

      await expect(newQuestion(await newEvent())).rejects.toMatchObject({
        cause: { constraint: "event_registration_question_mode_check" }
      })
    })

    test("answer only their own Event's questions, and choose only that question's options", async () => {
      const eventId = await newEvent(socialEvent)
      const registrationId = await newRegistration(eventId, await newUser())
      const mainCourse = await newQuestion(eventId, "SingleChoice")
      const otherQuestion = await newQuestion(await newEvent(socialEvent))

      await expect(
        db.insert(eventRegistrationAnswer).values({ registrationId, questionId: otherQuestion }).execute()
      ).rejects.toMatchObject({ cause: { constraint: "event_registration_answer_question_check" } })

      const [vegetarian] = await db
        .insert(eventRegistrationQuestionOption)
        .values({ questionId: mainCourse, label: "Vegetarian", sortOrder: 1 })
        .returning({ id: eventRegistrationQuestionOption.id })
      const [foreign] = await db
        .insert(eventRegistrationQuestionOption)
        .values({ questionId: otherQuestion, label: "Meat", sortOrder: 1 })
        .returning({ id: eventRegistrationQuestionOption.id })
      await db.insert(eventRegistrationAnswer).values({ registrationId, questionId: mainCourse })
      await db
        .insert(eventRegistrationAnswerChoice)
        .values({ registrationId, questionId: mainCourse, optionId: vegetarian.id })

      await expect(
        db
          .insert(eventRegistrationAnswerChoice)
          .values({ registrationId, questionId: mainCourse, optionId: foreign.id })
          .execute()
      ).rejects.toMatchObject({ cause: { constraint: "event_registration_answer_choice_option_fk" } })
    })

    test("keep an answered question, and its chosen options, from being deleted", async () => {
      const eventId = await newEvent(socialEvent)
      const registrationId = await newRegistration(eventId, await newUser())
      const [allergies, mainCourse] = [await newQuestion(eventId), await newQuestion(eventId, "SingleChoice")]
      const [meat] = await db
        .insert(eventRegistrationQuestionOption)
        .values({ questionId: mainCourse, label: "Meat", sortOrder: 1 })
        .returning({ id: eventRegistrationQuestionOption.id })
      await db.insert(eventRegistrationAnswer).values([
        { registrationId, questionId: allergies, text: "Nuts" },
        { registrationId, questionId: mainCourse }
      ])
      await db
        .insert(eventRegistrationAnswerChoice)
        .values({ registrationId, questionId: mainCourse, optionId: meat.id })

      await expect(
        db.delete(eventRegistrationQuestion).where(eq(eventRegistrationQuestion.id, allergies)).execute()
      ).rejects.toMatchObject({ cause: { constraint: "event_registration_answer_question_fk" } })
      await expect(
        db.delete(eventRegistrationQuestionOption).where(eq(eventRegistrationQuestionOption.id, meat.id)).execute()
      ).rejects.toMatchObject({ cause: { constraint: "event_registration_answer_choice_option_fk" } })
    })

    test("rejects an answer with both a text and a checkbox value", async () => {
      const eventId = await newEvent(socialEvent)
      const registrationId = await newRegistration(eventId, await newUser())
      const questionId = await newQuestion(eventId)
      await expect(
        db.insert(eventRegistrationAnswer).values({ registrationId, questionId, text: "Nuts", checked: true }).execute()
      ).rejects.toMatchObject({ cause: { constraint: "event_registration_answer_one_value_check" } })
    })
  })

  describe("Attendance", () => {
    test("is recorded once per User and Event", async () => {
      const [eventId, userId] = [await newEvent(), await newUser()]
      await db.insert(eventAttendance).values({ eventId, userId, status: "Present" })
      await expect(
        db.insert(eventAttendance).values({ eventId, userId, status: "Absent" }).execute()
      ).rejects.toMatchObject({ cause: { constraint: "event_attendance_event_user_unique" } })
    })
  })

  test("deleting an Event deletes everything recorded for it", async () => {
    const rehearsalId = await newEvent()
    await db.insert(eventResponse).values({ eventId: rehearsalId, userId: await newUser(), answer: "Yes" })
    await db.insert(eventAttendance).values({ eventId: rehearsalId, userId: await newUser(), status: "Present" })

    const socialId = await newEvent(socialEvent)
    const registrationId = await newRegistration(socialId, await newUser())
    const [allergies, mainCourse] = [await newQuestion(socialId), await newQuestion(socialId, "SingleChoice")]
    const [meat] = await db
      .insert(eventRegistrationQuestionOption)
      .values({ questionId: mainCourse, label: "Meat", sortOrder: 1 })
      .returning({ id: eventRegistrationQuestionOption.id })
    await db.insert(eventRegistrationAnswer).values([
      { registrationId, questionId: allergies, text: "Nuts" },
      { registrationId, questionId: mainCourse }
    ])
    await db.insert(eventRegistrationAnswerChoice).values({ registrationId, questionId: mainCourse, optionId: meat.id })

    await db.delete(event).where(inArray(event.id, [rehearsalId, socialId]))
    expect(await db.select().from(eventResponse).where(eq(eventResponse.eventId, rehearsalId))).toEqual([])
    expect(await db.select().from(eventAttendance).where(eq(eventAttendance.eventId, rehearsalId))).toEqual([])
    expect(await db.select().from(eventRegistration).where(eq(eventRegistration.eventId, socialId))).toEqual([])
    expect(
      await db.select().from(eventRegistrationAnswer).where(eq(eventRegistrationAnswer.registrationId, registrationId))
    ).toEqual([])
  })

  test("Erasure keeps participation anonymously and wipes the free text", async () => {
    const [erased, recorder] = [await newUser(), await newUser()]
    const [exam] = await db.insert(absenceReason).values({ label: "Exam" }).returning({ id: absenceReason.id })

    const rehearsalId = await newEvent({ createdBy: erased })
    await db.insert(rehearsal).values({ eventId: rehearsalId, leaderUserId: erased })
    await db.insert(eventResponse).values({
      eventId: rehearsalId,
      userId: erased,
      answer: "No",
      absenceReasonId: exam.id,
      comment: "Sorry!"
    })
    await db
      .insert(eventAttendance)
      .values({ eventId: rehearsalId, userId: erased, status: "Excused", recordedBy: recorder })

    const strictId = await newEvent()
    await db.insert(eventResponse).values({ eventId: strictId, userId: erased, answer: "No", reasonText: "Moving" })

    const socialId = await newEvent(socialEvent)
    const registrationId = await newRegistration(socialId, erased, "See you there")
    const allergies = await newQuestion(socialId)
    const alcoholFree = await newQuestion(socialId, "Checkbox")
    await db.insert(eventRegistrationAnswer).values([
      { registrationId, questionId: allergies, text: "Nuts" },
      { registrationId, questionId: alcoholFree, checked: true }
    ])

    await db.delete(user).where(eq(user.id, erased))

    const responses = await db
      .select({
        userId: eventResponse.userId,
        absenceReasonId: eventResponse.absenceReasonId,
        comment: eventResponse.comment,
        reasonText: eventResponse.reasonText
      })
      .from(eventResponse)
      .where(inArray(eventResponse.eventId, [rehearsalId, strictId]))
    expect(responses).toHaveLength(2)
    expect(responses).toContainEqual({ userId: null, absenceReasonId: exam.id, comment: null, reasonText: null })
    expect(responses).toContainEqual({ userId: null, absenceReasonId: null, comment: null, reasonText: null })

    const [registration] = await db.select().from(eventRegistration).where(eq(eventRegistration.id, registrationId))
    expect(registration).toMatchObject({ userId: null, comment: null, status: "Registered" })
    const answers = await db
      .select({ text: eventRegistrationAnswer.text, checked: eventRegistrationAnswer.checked })
      .from(eventRegistrationAnswer)
      .where(eq(eventRegistrationAnswer.registrationId, registrationId))
    expect(answers).toHaveLength(2)
    expect(answers).toContainEqual({ text: null, checked: true })
    expect(answers).toContainEqual({ text: null, checked: null })

    const [attendance] = await db.select().from(eventAttendance).where(eq(eventAttendance.eventId, rehearsalId))
    expect(attendance).toMatchObject({ userId: null, status: "Excused", recordedBy: recorder })
    const [erasedEvent] = await db.select().from(event).where(eq(event.id, rehearsalId))
    expect(erasedEvent.createdBy).toBeNull()
    const [erasedRehearsal] = await db.select().from(rehearsal).where(eq(rehearsal.eventId, rehearsalId))
    expect(erasedRehearsal.leaderUserId).toBeNull()
  })
})
