"use client"

import { useEffect, useState, useTransition } from "react"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
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
import { searchUsersWithSubscriptions, sendTestNotificationToAll, sendTestNotificationToUsers } from "./actions"

type SubscribedUser = Awaited<ReturnType<typeof searchUsersWithSubscriptions>>[number]
type Feedback = { success: boolean; message: string }

export function NotificationManagementScreen() {
  const [broadcastMessage, setBroadcastMessage] = useState("")
  const [broadcastFeedback, setBroadcastFeedback] = useState<Feedback | null>(null)
  const [targetMessage, setTargetMessage] = useState("")
  const [targetFeedback, setTargetFeedback] = useState<Feedback | null>(null)
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

  function sendBroadcast() {
    setBroadcastFeedback(null)
    startTransition(async () => {
      try {
        const result = await sendTestNotificationToAll(broadcastMessage)
        setBroadcastFeedback({
          success: result.success,
          message: result.success ? "Notification sent to all active subscriptions." : result.error
        })
        if (result.success) setBroadcastMessage("")
      } catch {
        setBroadcastFeedback({ success: false, message: "Unable to send notifications right now." })
      }
    })
  }

  function sendToUser() {
    if (selectedUserIds.length === 0) return
    setTargetFeedback(null)
    startTransition(async () => {
      try {
        const result = await sendTestNotificationToUsers(selectedUserIds, targetMessage)
        setTargetFeedback({
          success: result.success,
          message: result.success ? "Notification sent to the selected users." : result.error
        })
        if (result.success) setTargetMessage("")
      } catch {
        setTargetFeedback({ success: false, message: "Unable to send the notification right now." })
      }
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h1 className="font-heading text-2xl font-semibold">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">Send test push notifications to subscribed members.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Broadcast to all</CardTitle>
            <CardDescription>Send immediately to every active push subscription.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Textarea
              value={broadcastMessage}
              onChange={(event) => setBroadcastMessage(event.target.value)}
              placeholder="Enter the notification message"
              disabled={isPending}
            />
            <Button
              type="button"
              className="w-fit"
              onClick={sendBroadcast}
              disabled={isPending || !broadcastMessage.trim()}
            >
              {isPending ? "Sending..." : "Send to all"}
            </Button>
            {broadcastFeedback ? <FeedbackMessage feedback={broadcastFeedback} /> : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Send to a specific user</CardTitle>
            <CardDescription>Only users with at least one active subscription are listed.</CardDescription>
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
                  placeholder="Search by name or email"
                  aria-label="Search subscribed users"
                  disabled={isPending}
                />
              </ComboboxChips>
              <ComboboxContent>
                <ComboboxList>
                  <ComboboxEmpty>{isSearching ? "Searching..." : "No subscribed users found"}</ComboboxEmpty>
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
              value={targetMessage}
              onChange={(event) => setTargetMessage(event.target.value)}
              placeholder="Enter the notification message"
              disabled={isPending}
            />
            <Button
              type="button"
              className="w-fit"
              onClick={sendToUser}
              disabled={isPending || selectedUserIds.length === 0 || !targetMessage.trim()}
            >
              {isPending ? "Sending..." : "Send to selected user"}
            </Button>
            {targetFeedback ? <FeedbackMessage feedback={targetFeedback} /> : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function FeedbackMessage({ feedback }: { feedback: Feedback }) {
  return (
    <Alert variant={feedback.success ? "default" : "destructive"}>
      <AlertDescription>{feedback.message}</AlertDescription>
    </Alert>
  )
}
