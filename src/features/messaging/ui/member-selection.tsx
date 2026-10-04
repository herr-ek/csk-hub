"use client"

import { XIcon } from "lucide-react"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { MemberCombobox } from "./inbox/member-combobox"

export type SelectedMember = { id: string; name: string }

export function MemberSelection({
  value,
  onChange,
  disabled = false,
  excludedIds = []
}: {
  value: SelectedMember[]
  onChange: (members: SelectedMember[]) => void
  disabled?: boolean
  excludedIds?: string[]
}) {
  const t = useTranslations("Messages")
  return (
    <>
      <MemberCombobox
        disabled={disabled}
        excludedIds={[...excludedIds, ...value.map((member) => member.id)]}
        onSelect={(member) => {
          if (!value.some((item) => item.id === member.id)) onChange([...value, member])
        }}
      />
      {value.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={t("selectedMembers")}>
          {value.map((member) => (
            <li key={member.id} className="max-w-full">
              <input type="hidden" name="memberIds" value={member.id} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-w-full"
                disabled={disabled}
                aria-label={t("removeSelectedMember", { name: member.name })}
                onClick={() => onChange(value.filter((item) => item.id !== member.id))}
              >
                <span className="truncate">{member.name}</span>
                <XIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
