"use client"

import { LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { useTranslations } from "@/core/i18n/translations"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList
} from "@/shared/ui/base/combobox"
import { searchMembersAction } from "./actions"

type Member = { id: string; name: string; username: string | null }

export function MemberCombobox() {
  const t = useTranslations("Messages")
  const router = useRouter()
  const [value, setValue] = useState("")
  const [members, setMembers] = useState<Member[]>([])
  const [loading, startTransition] = useTransition()
  const latestRequest = useRef(0)

  useEffect(() => {
    const request = ++latestRequest.current
    const query = value.trim()
    const timer = setTimeout(() => {
      if (!query) {
        setMembers([])
        return
      }
      startTransition(() => {
        searchMembersAction(query)
          .then((result) => {
            if (latestRequest.current === request) setMembers(result)
          })
          .catch(() => {
            if (latestRequest.current === request) setMembers([])
          })
      })
    }, 250)

    return () => clearTimeout(timer)
  }, [value])

  return (
    <Combobox
      items={members}
      itemToStringLabel={(member: Member | null) => (member ? `${member.name} ${member.username ?? ""}` : "")}
      value={null}
      onValueChange={(member) => {
        const selected = member as Member | null
        if (selected) router.push(`/messages/new?recipientId=${selected.id}`)
      }}
      onInputValueChange={setValue}
    >
      <ComboboxInput
        className="w-full"
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        showTrigger={false}
      />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty>
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" aria-label={t("searching")} />
            ) : value.trim() ? (
              t("noMembers")
            ) : (
              t("typeToSearch")
            )}
          </ComboboxEmpty>
          {members.map((member) => (
            <ComboboxItem key={member.id} value={member}>
              <span>{member.name}</span>
              {member.username ? (
                <span className="text-muted-foreground">{t("usernameHandle", { username: member.username })}</span>
              ) : null}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
