import { GROUP_POLICIES } from "./catalogue"
import { hasExplicitGroupName } from "./group-names"
import { GroupType, PositionCode } from "./identifiers"

export type GroupTypeKey = keyof typeof GroupType
export type PositionCodeKey = keyof typeof PositionCode

const groupKeys = new Map(Object.entries(GroupType).map(([key, value]) => [value, key as GroupTypeKey]))
const positionKeys = new Map(Object.entries(PositionCode).map(([key, value]) => [value, key as PositionCodeKey]))

/** English translation key for a stable stored Group type. */
export function groupTypeKey(type: GroupType): GroupTypeKey {
  const key = groupKeys.get(type)
  if (!key) throw new Error(`Unknown Group type: ${type}`)
  return key
}

/** English translation key for a stable stored Position code. */
export function positionCodeKey(code: PositionCode): PositionCodeKey {
  const key = positionKeys.get(code)
  if (!key) throw new Error(`Unknown Position code: ${code}`)
  return key
}

export type GroupLabelInput = {
  type: GroupType
  name: string | null
  organisationYear: number | null
  choirName?: string | null
}

export type GroupLabelTranslator = (
  key: `types.${GroupTypeKey}` | "labels.annual" | "labels.choirTeam",
  values?: Record<string, string | number>
) => string

/** Formats the complete display label with ICU templates in the viewer's locale. */
export function formatGroupLabel(group: GroupLabelInput, translate: GroupLabelTranslator): string {
  if (hasExplicitGroupName(group.type)) return group.name ?? ""
  const type = translate(`types.${groupTypeKey(group.type)}`)
  if (GROUP_POLICIES[group.type].lifetime === "annual") {
    if (group.organisationYear === null) throw new Error("Annual Group has no organisational year.")
    const year = `${String(group.organisationYear).slice(-2)}/${String(group.organisationYear + 1).slice(-2)}`
    return translate("labels.annual", { type, year })
  }
  if (GROUP_POLICIES[group.type].scope === "choir") {
    if (!group.choirName) throw new Error("Choir team has no owning Choir name.")
    return translate("labels.choirTeam", { type, choir: group.choirName })
  }
  return type
}
