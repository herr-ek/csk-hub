"use client"

import { useCallback, useEffect, useState } from "react"
import { authClient } from "@/core/auth/auth-client"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Badge } from "@/shared/ui/base/badge"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"

type Session = NonNullable<Awaited<ReturnType<typeof authClient.listSessions>>["data"]>[number]

const sessionDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
})

function formatSessionDate(value: Date | string) {
  return sessionDateFormatter.format(new Date(value))
}

export function SessionsSettings({ currentSessionToken }: { currentSessionToken: string }) {
  const [sessions, setSessions] = useState<Session[]>([])
  const [error, setError] = useState<string>()
  const [pendingToken, setPendingToken] = useState<string>()

  const loadSessions = useCallback(async () => {
    setError(undefined)
    const result = await authClient.listSessions()
    if (result.data) setSessions(result.data)
    if (result.error) setError(result.error.message ?? "Unable to load active sessions.")
  }, [])

  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  async function revoke(token: string) {
    setPendingToken(token)
    const result = await authClient.revokeSession({ token })
    setPendingToken(undefined)
    if (result.error) setError(result.error.message ?? "Unable to revoke the session.")
    else if (token === currentSessionToken) window.location.assign("/login")
    else await loadSessions()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active sessions</CardTitle>
        <CardDescription>Devices currently signed in to your account.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sessions.map((session) => {
          const current = session.token === currentSessionToken
          return (
            <div key={session.token} className="flex flex-col gap-4 rounded-2xl border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="wrap-break-word font-medium">{session.userAgent || "Unknown device"}</p>
                  {current ? <Badge variant="secondary">This device</Badge> : null}
                </div>
                <Button
                  type="button"
                  variant={current ? "outline" : "destructive"}
                  size="sm"
                  onClick={() => void revoke(session.token)}
                  disabled={pendingToken === session.token}
                >
                  {pendingToken === session.token ? "Signing out..." : current ? "Sign out" : "Delete"}
                </Button>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 border-t pt-3 text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">IP address:</span> {session.ipAddress || "Unknown"}
                </p>
                <p>
                  <span className="font-medium text-foreground">Expires:</span> {formatSessionDate(session.expiresAt)}
                </p>
              </div>
            </div>
          )
        })}
        {sessions.length === 0 ? <p className="text-sm text-muted-foreground">No active sessions found.</p> : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
