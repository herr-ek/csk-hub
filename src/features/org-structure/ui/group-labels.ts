import "server-only"

import { eq } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "@/core/db"
import { group, section } from "@/core/db/schema/org-structure"
import { getTranslations } from "@/core/i18n/server"
import { formatGroupLabel } from "@/core/org-structure"

/** Presentation labels for concrete Group identities in the viewer's locale. */
export async function listLocalizedGroupLabels() {
  const choir = alias(group, "label_owning_choir")
  const [rows, translate] = await Promise.all([
    db
      .select({ group, choirName: choir.name, sectionVoice: section.voice })
      .from(group)
      .leftJoin(choir, eq(choir.id, group.choirId))
      .leftJoin(section, eq(section.groupId, group.id)),
    getTranslations("Groups")
  ])
  return new Map(
    rows.map(({ group: row, choirName, sectionVoice }) => [
      row.id,
      formatGroupLabel({ ...row, choirName, sectionVoice }, translate)
    ])
  )
}
