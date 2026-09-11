"use client"

import { useEffect, useState, useTransition } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue
} from "@/shared/ui/base/combobox"
import { Textarea } from "@/shared/ui/base/textarea"
import { searchUsersWithSubscriptions, sendTestNotificationToUsers } from "./actions"
import { type NotificationFeedback, NotificationFeedbackMessage } from "./notification-feedback"

type SubscribedUser = Awaited<ReturnType<typeof searchUsersWithSubscriptions>>[number]

export function SendToSelectedUsersCard() {
  const t = useTranslations("PushNotifications")
  const [message, setMessage] = useState("")
  const [feedback, setFeedback] = useState<NotificationFeedback | null>(null)
  const [search, setSearch] = useState("")
  const [users, setUsers] = useState<SubscribedUser[]>([])
  const [knownUsers, setKnownUsers] = useState<SubscribedUser[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const result = await searchUsersWithSubscriptions(search)
        if (!cancelled) {
          setUsers(result)
          setKnownUsers((current) => {
            const usersById = new Map(current.map((user) => [user.id, user]))
            for (const user of result) usersById.set(user.id, user)
            return [...usersById.values()]
          })
        }
      } finally {
        if (!cancelled) setIsSearching(false)
      }
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [search])

  function sendToSelectedUsers() {
    if (selectedUserIds.length === 0) return
    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await sendTestNotificationToUsers(selectedUserIds, message)
        setFeedback({
          success: result.success,
          message: result.success ? t("sentToSelected") : result.error
        })
        if (result.success) setMessage("")
      } catch {
        setFeedback({ success: false, message: t("sendSelectedFailed") })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("selectedTitle")}</CardTitle>
        <CardDescription>{t("selectedDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Combobox
          multiple
          value={selectedUserIds}
          onValueChange={(value) => setSelectedUserIds(value as string[])}
          inputValue={search}
          onInputValueChange={setSearch}
          filter={null}
        >
          <ComboboxChips>
            <ComboboxValue>
              {(value: string[]) =>
                value.map((userId) => {
                  const user = knownUsers.find((candidate) => candidate.id === userId)
                  return (
                    <ComboboxChip key={userId} showRemove>
                      {user?.name ?? userId}
                    </ComboboxChip>
                  )
                })
              }
            </ComboboxValue>
            <ComboboxChipsInput
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchLabel")}
              disabled={isPending}
            />
          </ComboboxChips>
          <ComboboxContent>
            <ComboboxList>
              <ComboboxEmpty>{isSearching ? t("searching") : t("noSubscribedUsers")}</ComboboxEmpty>
              {users.map((user) => (
                <ComboboxItem key={user.id} value={user.id}>
                  <span>{user.name}</span>
                  <span className="text-muted-foreground">{user.email}</span>
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        <Textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t("messagePlaceholder")}
          disabled={isPending}
        />
        <Button
          type="button"
          className="w-fit"
          onClick={sendToSelectedUsers}
          disabled={isPending || selectedUserIds.length === 0 || !message.trim()}
        >
          {isPending ? t("sending") : t("sendToSelected")}
        </Button>
        {feedback ? <NotificationFeedbackMessage feedback={feedback} /> : null}
      </CardContent>
    </Card>
  )
}
