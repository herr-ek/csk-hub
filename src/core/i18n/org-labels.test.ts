import { expect, test } from "bun:test"
import { createTranslator } from "next-intl"
import { formatGroupLabel, GroupType, PositionCode, positionCodeKey } from "@/core/org-structure"
import { getMessages } from "./messages"

for (const [locale, board, team, parents] of [
  ["en", "Board 26/27", "MK · Rehearsal setup crew", "Section parents"],
  ["sv", "Styrelse 26/27", "MK · Roddgrupp", "Föräldramötet"],
  ["de", "Vorstand 26/27", "MK · Probenaufbau-Team", "Stimmeltern"]
] as const) {
  test(`${locale} derives fixed labels and preserves individual names`, () => {
    const translate = createTranslator({ locale, messages: getMessages(locale), namespace: "Groups" })
    expect(formatGroupLabel({ type: GroupType.Board, name: null, organisationYear: 2026 }, translate)).toBe(board)
    expect(
      formatGroupLabel(
        { type: GroupType.EquipmentTeam, name: null, organisationYear: null, choirName: "MK" },
        translate
      )
    ).toBe(team)
    expect(formatGroupLabel({ type: GroupType.ParentsMeeting, name: null, organisationYear: null }, translate)).toBe(
      parents
    )
    expect(
      formatGroupLabel({ type: GroupType.GigGroup, name: "Summer concert", organisationYear: null }, translate)
    ).toBe("Summer concert")
    const key = positionCodeKey(PositionCode.Secretary)
    expect(translate(`positionLabels.${key}`)).toBe(getMessages(locale).Groups.positionLabels.Secretary)
    expect(
      formatGroupLabel(
        { type: GroupType.EquipmentTeam, name: null, organisationYear: null, choirName: "Renamed MK" },
        translate
      )
    ).toContain("Renamed MK")
  })
}
