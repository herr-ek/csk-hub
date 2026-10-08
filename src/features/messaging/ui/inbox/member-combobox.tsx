"use client"

import { LoaderCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
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
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "results" | "empty" | "error">("idle")
  const [, startTransition] = useTransition()
  const latestRequest = useRef(0)

  const searchMembers = useCallback((query: string, request: number) => {
    startTransition(() => {
      return searchMembersAction(query)
        .then((result) => {
          if (latestRequest.current === request) {
            setMembers(result)
            setSearchStatus(result.length > 0 ? "results" : "empty")
          }
        })
        .catch(() => {
          if (latestRequest.current === request) {
            setMembers([])
            setSearchStatus("error")
          }
        })
    })
  }, [])

  useEffect(() => {
    const request = ++latestRequest.current
    const query = value.trim()

    if (!query) {
      setMembers([])
      setSearchStatus("idle")
      return
    }

    setMembers([])
    setSearchStatus("loading")
    const timer = setTimeout(() => searchMembers(query, request), 250)

    return () => clearTimeout(timer)
  }, [value, searchMembers])

  function retrySearch() {
    const query = value.trim()
    if (!query) return
    const request = ++latestRequest.current
    setMembers([])
    setSearchStatus("loading")
    searchMembers(query, request)
  }

  const loading = searchStatus === "loading"

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
            ) : searchStatus === "error" ? (
              <div className="flex flex-col items-center gap-2">
                <span role="alert">{t("searchFailed")}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={retrySearch}
                >
                  {t("retrySearch")}
                </Button>
              </div>
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
