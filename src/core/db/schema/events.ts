import type { JSONContent } from "@tiptap/core"
import { relations, sql } from "drizzle-orm"
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { group } from "./org-structure"
import { voiceFamily } from "./voice"

// The CSK calendar: Events, who they are for, and what they collect from their audience
// (Responses or Registrations) and record afterwards (Attendance). The scheme is "Events scheme
// (v2)" in `docs/schemas/Events - DB Scheme.md`, which tags every rule with where it is enforced;
// the rules tagged [app] are not database constraints.
//
// Drizzle cannot express triggers, so `drizzle/0012_events.sql` carries these additions written
// by hand, each marked "Hand-written in drizzle/0012_events.sql" here and "Added by hand" there:
//   1. the `event_participation_mode_change_check` trigger and its function
//   2. the `event_response_check` trigger and its function
//   3. the `event_registration_check` trigger and its function
//   4. the `event_registration_question_check` trigger and its function
//   5. the `event_registration_answer_check` trigger and its function
//   6. the `event_response_erasure` and `event_registration_erasure` triggers and their functions
// drizzle-kit neither generates nor diffs them. A regenerated migration loses them unless they are
// copied back, and changing one later takes a hand-written migration. The triggers raise errors
// that name a constraint, so callers can map them like any other constraint violation.

export const eventType = pgEnum("event_type", [
  "Rehearsal",
  "Gig",
  "Concert",
  "Social",
  "Rephelg",
  "Körmöte",
  "Booking", // Reserving a room.
  "Meeting", // Board, committee and other general meetings; a Körmöte is its own type.
  "Other"
])

export const eventStatus = pgEnum("event_status", ["Draft", "Published", "Cancelled"])

// What an Event collects from its audience in advance. The code branches on every value.
export const participationMode = pgEnum("participation_mode", [
  "None",
  "ResponseRequired",
  "ResponseRequiredStrict",
  "Registration"
])

export const rsvpAnswer = pgEnum("rsvp_answer", ["Yes", "No", "Maybe"])
export const attendanceStatus = pgEnum("attendance_status", ["Present", "Excused", "Absent"])
export const registrationStatus = pgEnum("registration_status", ["Registered", "Withdrawn"])
export const registrationQuestionKind = pgEnum("registration_question_kind", [
  "Text",
  "SingleChoice",
  "MultipleChoice",
  "Checkbox"
])

/** A reusable venue. Archived, never deleted. */
export const location = pgTable(
  "location",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    address: text("address"),
    mapUrl: text("map_url"),
    active: boolean("active").default(true).notNull()
  },
  (table) => [
    uniqueIndex("location_name_active_unique").on(table.name).where(sql`${table.active}`),
    check("location_name_not_blank_check", sql`length(btrim(${table.name})) > 0`)
  ]
)

/** A named grouping of recurring occurrences; each occurrence is its own Event. Stores no template. */
export const eventSeries = pgTable(
  "event_series",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [check("event_series_name_not_blank_check", sql`length(btrim(${table.name})) > 0`)]
)

/**
 * Deleting an Event deletes everything recorded for it, Responses, Registrations and Attendance
 * included. The app warns and asks for confirmation first; the database does not refuse.
 */
export const event = pgTable(
  "event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: eventType("type").notNull(),
    status: eventStatus("status").default("Draft").notNull(),
    title: text("title").notNull(),
    // The editor's own document, parsed through the Events document schema before it
    // is written. Null when there is nothing to read.
    description: jsonb("description").$type<JSONContent>(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    // For all-day events, 00:00 on the day after the last day, in Europe/Stockholm.
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").default(false).notNull(),
    locationId: uuid("location_id").references(() => location.id, { onDelete: "restrict" }),
    // A detail ("room 3") or a one-off place; shown instead of the Location when set.
    locationText: text("location_text"),
    // Arrival time, at or before the start.
    callTime: timestamp("call_time", { withTimezone: true }),
    // The deadline for Responses or Registrations, whichever the mode collects. Late ones are
    // accepted and flagged, never blocked.
    respondBy: timestamp("respond_by", { withTimezone: true }),
    // No database default: the app picks one by type, and the organiser may override it.
    // Hand-written in drizzle/0012_events.sql (1): the `event_participation_mode_change_check`
    // trigger rejects a change that would strand Responses, Registrations or Registration
    // questions under a mode that does not collect them.
    participationMode: participationMode("participation_mode").notNull(),
    // Who is responsible, and so who may edit it; not the audience.
    organiserGroupId: uuid("organiser_group_id").references(() => group.id, { onDelete: "restrict" }),
    seriesId: uuid("series_id").references(() => eventSeries.id, { onDelete: "restrict" }),
    // Null after Erasure.
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    // Lets the extension tables pin their type through a composite foreign key.
    unique("event_id_type_unique").on(table.id, table.type),
    index("event_starts_at_idx").on(table.startsAt),
    index("event_series_id_idx").on(table.seriesId),
    index("event_organiser_group_id_idx").on(table.organiserGroupId),
    check("event_title_not_blank_check", sql`length(btrim(${table.title})) > 0`),
    check("event_period_check", sql`${table.endsAt} > ${table.startsAt}`),
    check("event_call_time_check", sql`${table.callTime} IS NULL OR ${table.callTime} <= ${table.startsAt}`),
    check("event_respond_by_check", sql`${table.respondBy} IS NULL OR ${table.respondBy} <= ${table.startsAt}`),
    check("event_respond_by_mode_check", sql`${table.participationMode} <> 'None' OR ${table.respondBy} IS NULL`)
  ]
)

/** Practical information shown on the Event in `sortOrder`: "Dress code: Kavaj". */
export const eventDetail = pgTable(
  "event_detail",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    value: text("value").notNull(),
    sortOrder: integer("sort_order").notNull()
  },
  (table) => [
    index("event_detail_event_id_idx").on(table.eventId),
    check("event_detail_label_not_blank_check", sql`length(btrim(${table.label})) > 0`)
  ]
)

// --- Extension tables: 1:1 with an Event of one type, like Choirs and Sections extend Groups ---
//
// Each carries a constant `type` and a composite foreign key to `event (id, type)`, so it cannot
// be attached to an Event of another type, nor can the Event's type change while it exists. That
// an Event of the type has its row is the app's job.

/** A 1:1 extension of a Rehearsal. */
export const rehearsal = pgTable(
  "rehearsal",
  {
    eventId: uuid("event_id").primaryKey(),
    type: eventType("type").default("Rehearsal").notNull(),
    // Who leads it if not the usual conductor; needn't be a member. Null after Erasure.
    leaderUserId: text("leader_user_id").references(() => user.id, { onDelete: "set null" })
  },
  (table) => [
    foreignKey({ columns: [table.eventId, table.type], foreignColumns: [event.id, event.type] }).onDelete("cascade"),
    check("rehearsal_type_check", sql`${table.type} = 'Rehearsal'`)
  ]
)

/** A 1:1 extension of a Gig. */
export const gig = pgTable(
  "gig",
  {
    eventId: uuid("event_id").primaryKey(),
    type: eventType("type").default("Gig").notNull(),
    // The person CSK appointed for this gig, set explicitly. Null after Erasure.
    responsibleUserId: text("responsible_user_id").references(() => user.id, { onDelete: "set null" }),
    // The booking contact or client: an external person, not a User. Personal data about a
    // non-User, to be cleared when no longer needed.
    contactName: text("contact_name"),
    contactDetails: text("contact_details")
  },
  (table) => [
    foreignKey({ columns: [table.eventId, table.type], foreignColumns: [event.id, event.type] }).onDelete("cascade"),
    check("gig_type_check", sql`${table.type} = 'Gig'`)
  ]
)

/** A 1:1 extension of a Social event. */
export const socialEvent = pgTable(
  "social_event",
  {
    eventId: uuid("event_id").primaryKey(),
    type: eventType("type").default("Social").notNull(),
    // Free text: prices vary between members, so there is no amount column.
    costInfo: text("cost_info")
  },
  (table) => [
    foreignKey({ columns: [table.eventId, table.type], foreignColumns: [event.id, event.type] }).onDelete("cascade"),
    check("social_event_type_check", sql`${table.type} = 'Social'`)
  ]
)

// --- Audience ---

/**
 * One rule for who an Event is for. Several rows are OR'ed; inside a row, the group and the
 * Voice family are AND'ed. An Event with no rows is for everyone in CSK. The audience itself is
 * computed from these and dated Memberships, never stored.
 */
export const eventTarget = pgTable(
  "event_target",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => group.id, { onDelete: "restrict" }),
    // A `voice_family` domain column: filters cast it, `${eventTarget.voiceFamily}::voice = 'B'`.
    voiceFamily: voiceFamily("voice_family")
  },
  (table) => [
    unique("event_target_unique").on(table.eventId, table.groupId, table.voiceFamily).nullsNotDistinct(),
    index("event_target_group_id_idx").on(table.groupId),
    check("event_target_not_empty_check", sql`${table.groupId} IS NOT NULL OR ${table.voiceFamily} IS NOT NULL`)
  ]
)

// --- Responses: ResponseRequired and ResponseRequiredStrict ---

/** The global, Admin-managed list of preset reasons for declining. Archived, never deleted. */
export const absenceReason = pgTable(
  "absence_reason",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    label: text("label").notNull(),
    active: boolean("active").default(true).notNull()
  },
  (table) => [
    uniqueIndex("absence_reason_label_active_unique").on(table.label).where(sql`${table.active}`),
    check("absence_reason_label_not_blank_check", sql`length(btrim(${table.label})) > 0`)
  ]
)

/**
 * A singer's answer in advance. No row means no response yet. A surrogate key, so the row can
 * outlive its User.
 *
 * Hand-written in drizzle/0012_events.sql (2): the `event_response_check` trigger accepts a
 * Response only to a Published Event in a response mode (`event_response_mode_check`), and in
 * ResponseRequiredStrict only Yes, or No with a reason (`event_response_strict_check`).
 * Hand-written in drizzle/0012_events.sql (6): Erasure also wipes `comment` and `reasonText`.
 */
export const eventResponse = pgTable(
  "event_response",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    // Null after Erasure.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    answer: rsvpAnswer("answer").notNull(),
    comment: text("comment"),
    // A preset reason or a custom one, only with No.
    absenceReasonId: uuid("absence_reason_id").references(() => absenceReason.id, { onDelete: "restrict" }),
    reasonText: text("reason_text"),
    // The latest change; late when after the Event's `respondBy`.
    respondedAt: timestamp("responded_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    // Erased Users (null) do not collide.
    unique("event_response_event_user_unique").on(table.eventId, table.userId),
    index("event_response_user_id_idx").on(table.userId),
    check("event_response_one_reason_check", sql`${table.absenceReasonId} IS NULL OR ${table.reasonText} IS NULL`),
    check(
      "event_response_reason_only_with_no_check",
      sql`${table.answer} = 'No' OR (${table.absenceReasonId} IS NULL AND ${table.reasonText} IS NULL)`
    )
  ]
)

// --- Registrations: Registration mode ---

/**
 * What the organiser asks registrants, in `sortOrder`.
 *
 * Hand-written in drizzle/0012_events.sql (4): the `event_registration_question_check` trigger
 * accepts a question only on an Event in Registration mode
 * (`event_registration_question_mode_check`).
 */
export const eventRegistrationQuestion = pgTable(
  "event_registration_question",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    kind: registrationQuestionKind("kind").notNull(),
    required: boolean("required").default(false).notNull(),
    sortOrder: integer("sort_order").notNull()
  },
  (table) => [
    index("event_registration_question_event_id_idx").on(table.eventId),
    check("event_registration_question_label_not_blank_check", sql`length(btrim(${table.label})) > 0`)
  ]
)

/** A choice of a SingleChoice or MultipleChoice question, in `sortOrder`. */
export const eventRegistrationQuestionOption = pgTable(
  "event_registration_question_option",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionId: uuid("question_id").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull()
  },
  (table) => [
    // Named here: the generated name exceeds Postgres's 63 characters.
    foreignKey({
      name: "event_registration_question_option_question_fk",
      columns: [table.questionId],
      foreignColumns: [eventRegistrationQuestion.id]
    }).onDelete("cascade"),
    // The target of the composite foreign key that keeps a chosen option within its question.
    unique("event_registration_question_option_question_unique").on(table.questionId, table.id),
    check("event_registration_question_option_label_not_blank_check", sql`length(btrim(${table.label})) > 0`)
  ]
)

/**
 * A User signing up. No row means not signed up, never a No or an absence. Withdrawing keeps the
 * row and its answers. A surrogate key, so the row can outlive its User.
 *
 * Hand-written in drizzle/0012_events.sql (3): the `event_registration_check` trigger accepts a
 * Registration only on an Event in Registration mode, and registering (status Registered) only
 * while the Event is Published (`event_registration_mode_check`).
 * Hand-written in drizzle/0012_events.sql (6): Erasure also wipes `comment` and every text answer.
 */
export const eventRegistration = pgTable(
  "event_registration",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    // Null after Erasure.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    status: registrationStatus("status").default("Registered").notNull(),
    comment: text("comment"),
    // The latest (re-)registration; late when after the Event's `respondBy`.
    registeredAt: timestamp("registered_at", { withTimezone: true }).defaultNow().notNull(),
    // Set exactly while Withdrawn.
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true })
  },
  (table) => [
    // Erased Users (null) do not collide.
    unique("event_registration_event_user_unique").on(table.eventId, table.userId),
    index("event_registration_user_id_idx").on(table.userId),
    check(
      "event_registration_withdrawn_check",
      sql`(${table.status} = 'Withdrawn') = (${table.withdrawnAt} IS NOT NULL)`
    )
  ]
)

/**
 * One answered question of a Registration. Text and Checkbox answers carry their value here;
 * choice answers carry their options in `eventRegistrationAnswerChoice`. That an answer fits its
 * question's kind is the app's job.
 *
 * Hand-written in drizzle/0012_events.sql (5): the `event_registration_answer_check` trigger
 * requires the question to belong to the Registration's Event
 * (`event_registration_answer_question_check`).
 */
export const eventRegistrationAnswer = pgTable(
  "event_registration_answer",
  {
    registrationId: uuid("registration_id").notNull(),
    questionId: uuid("question_id").notNull(),
    text: text("text"),
    checked: boolean("checked")
  },
  (table) => [
    // The keys are named here: the generated names exceed Postgres's 63 characters.
    primaryKey({ name: "event_registration_answer_pk", columns: [table.registrationId, table.questionId] }),
    foreignKey({
      name: "event_registration_answer_registration_fk",
      columns: [table.registrationId],
      foreignColumns: [eventRegistration.id]
    }).onDelete("cascade"),
    // Once answered, a question can be relabelled but not deleted. No action rather than restrict:
    // it is checked at the end of the statement, so deleting the whole Event, which removes the
    // answers along with the questions, still goes through.
    foreignKey({
      name: "event_registration_answer_question_fk",
      columns: [table.questionId],
      foreignColumns: [eventRegistrationQuestion.id]
    }).onDelete("no action"),
    index("event_registration_answer_question_id_idx").on(table.questionId),
    check("event_registration_answer_one_value_check", sql`${table.text} IS NULL OR ${table.checked} IS NULL`)
  ]
)

/** A chosen option of a SingleChoice or MultipleChoice answer. */
export const eventRegistrationAnswerChoice = pgTable(
  "event_registration_answer_choice",
  {
    registrationId: uuid("registration_id").notNull(),
    questionId: uuid("question_id").notNull(),
    optionId: uuid("option_id").notNull()
  },
  (table) => [
    primaryKey({
      name: "event_registration_answer_choice_pk",
      columns: [table.registrationId, table.questionId, table.optionId]
    }),
    foreignKey({
      name: "event_registration_answer_choice_answer_fk",
      columns: [table.registrationId, table.questionId],
      foreignColumns: [eventRegistrationAnswer.registrationId, eventRegistrationAnswer.questionId]
    }).onDelete("cascade"),
    // The option belongs to the answered question, and once chosen is not deleted; no action for
    // the same reason as `event_registration_answer_question_fk`.
    foreignKey({
      name: "event_registration_answer_choice_option_fk",
      columns: [table.questionId, table.optionId],
      foreignColumns: [eventRegistrationQuestionOption.questionId, eventRegistrationQuestionOption.id]
    }).onDelete("no action"),
    index("event_registration_answer_choice_option_idx").on(table.questionId, table.optionId)
  ]
)

// --- Attendance: what actually happened ---

/** No row means not recorded, never Absent. Independent of the Response or Registration. */
export const eventAttendance = pgTable(
  "event_attendance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    // Null after Erasure.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    status: attendanceStatus("status").notNull(),
    // Null after Erasure.
    recordedBy: text("recorded_by").references(() => user.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    // Erased Users (null) do not collide.
    unique("event_attendance_event_user_unique").on(table.eventId, table.userId),
    index("event_attendance_user_id_idx").on(table.userId)
  ]
)

export const locationRelations = relations(location, ({ many }) => ({
  events: many(event)
}))

export const eventSeriesRelations = relations(eventSeries, ({ many }) => ({
  events: many(event)
}))

export const eventRelations = relations(event, ({ one, many }) => ({
  location: one(location, { fields: [event.locationId], references: [location.id] }),
  series: one(eventSeries, { fields: [event.seriesId], references: [eventSeries.id] }),
  organiserGroup: one(group, { fields: [event.organiserGroupId], references: [group.id] }),
  creator: one(user, { fields: [event.createdBy], references: [user.id], relationName: "eventCreator" }),
  rehearsal: one(rehearsal, { fields: [event.id], references: [rehearsal.eventId] }),
  gig: one(gig, { fields: [event.id], references: [gig.eventId] }),
  socialEvent: one(socialEvent, { fields: [event.id], references: [socialEvent.eventId] }),
  details: many(eventDetail),
  targets: many(eventTarget),
  responses: many(eventResponse),
  registrationQuestions: many(eventRegistrationQuestion),
  registrations: many(eventRegistration),
  attendance: many(eventAttendance)
}))

export const eventDetailRelations = relations(eventDetail, ({ one }) => ({
  event: one(event, { fields: [eventDetail.eventId], references: [event.id] })
}))

export const rehearsalRelations = relations(rehearsal, ({ one }) => ({
  event: one(event, { fields: [rehearsal.eventId], references: [event.id] }),
  leader: one(user, { fields: [rehearsal.leaderUserId], references: [user.id], relationName: "rehearsalLeader" })
}))

export const gigRelations = relations(gig, ({ one }) => ({
  event: one(event, { fields: [gig.eventId], references: [event.id] }),
  responsible: one(user, { fields: [gig.responsibleUserId], references: [user.id], relationName: "gigResponsible" })
}))

export const socialEventRelations = relations(socialEvent, ({ one }) => ({
  event: one(event, { fields: [socialEvent.eventId], references: [event.id] })
}))

export const eventTargetRelations = relations(eventTarget, ({ one }) => ({
  event: one(event, { fields: [eventTarget.eventId], references: [event.id] }),
  group: one(group, { fields: [eventTarget.groupId], references: [group.id] })
}))

export const absenceReasonRelations = relations(absenceReason, ({ many }) => ({
  responses: many(eventResponse)
}))

export const eventResponseRelations = relations(eventResponse, ({ one }) => ({
  event: one(event, { fields: [eventResponse.eventId], references: [event.id] }),
  user: one(user, { fields: [eventResponse.userId], references: [user.id], relationName: "eventResponse" }),
  absenceReason: one(absenceReason, { fields: [eventResponse.absenceReasonId], references: [absenceReason.id] })
}))

export const eventRegistrationQuestionRelations = relations(eventRegistrationQuestion, ({ one, many }) => ({
  event: one(event, { fields: [eventRegistrationQuestion.eventId], references: [event.id] }),
  options: many(eventRegistrationQuestionOption),
  answers: many(eventRegistrationAnswer)
}))

export const eventRegistrationQuestionOptionRelations = relations(eventRegistrationQuestionOption, ({ one }) => ({
  question: one(eventRegistrationQuestion, {
    fields: [eventRegistrationQuestionOption.questionId],
    references: [eventRegistrationQuestion.id]
  })
}))

export const eventRegistrationRelations = relations(eventRegistration, ({ one, many }) => ({
  event: one(event, { fields: [eventRegistration.eventId], references: [event.id] }),
  user: one(user, { fields: [eventRegistration.userId], references: [user.id], relationName: "eventRegistration" }),
  answers: many(eventRegistrationAnswer)
}))

export const eventRegistrationAnswerRelations = relations(eventRegistrationAnswer, ({ one, many }) => ({
  registration: one(eventRegistration, {
    fields: [eventRegistrationAnswer.registrationId],
    references: [eventRegistration.id]
  }),
  question: one(eventRegistrationQuestion, {
    fields: [eventRegistrationAnswer.questionId],
    references: [eventRegistrationQuestion.id]
  }),
  choices: many(eventRegistrationAnswerChoice)
}))

export const eventRegistrationAnswerChoiceRelations = relations(eventRegistrationAnswerChoice, ({ one }) => ({
  answer: one(eventRegistrationAnswer, {
    fields: [eventRegistrationAnswerChoice.registrationId, eventRegistrationAnswerChoice.questionId],
    references: [eventRegistrationAnswer.registrationId, eventRegistrationAnswer.questionId]
  }),
  option: one(eventRegistrationQuestionOption, {
    fields: [eventRegistrationAnswerChoice.optionId],
    references: [eventRegistrationQuestionOption.id]
  })
}))

export const eventAttendanceRelations = relations(eventAttendance, ({ one }) => ({
  event: one(event, { fields: [eventAttendance.eventId], references: [event.id] }),
  user: one(user, { fields: [eventAttendance.userId], references: [user.id], relationName: "eventAttendee" }),
  recorder: one(user, {
    fields: [eventAttendance.recordedBy],
    references: [user.id],
    relationName: "eventAttendanceRecorder"
  })
}))
