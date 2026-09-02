"use client"

import { CircleCheckIcon, CircleXIcon, Loader2Icon } from "lucide-react"
import { Alert, AlertDescription } from "@/shared/ui/base/alert"
import { Button } from "@/shared/ui/base/button"
import { Field, FieldError, FieldLabel } from "@/shared/ui/base/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/shared/ui/base/input-group"
import { type UsernameAvailability, useUsernameSettings } from "./use-username-settings"

export function UsernameSetting({ initialUsername }: { initialUsername: string }) {
  const state = useUsernameSettings(initialUsername)

  return (
    <div>
      <dt className="text-sm font-medium">Username</dt>
      <dd className="mt-1">
        {state.isEditing ? (
          <form onSubmit={state.save}>
            <div className="mt-1 flex flex-col gap-2">
              <Field>
                <FieldLabel className="sr-only" htmlFor="settings-username">
                  Username
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="settings-username"
                    value={state.username}
                    onChange={(event) => state.changeUsername(event.target.value)}
                    required
                  />
                  <UsernameAvailabilityIndicator
                    availability={state.availability}
                    message={state.availabilityMessage}
                  />
                </InputGroup>
                <FieldError>{state.error}</FieldError>
              </Field>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={!state.canSave}>
                  {state.isPending ? "Saving..." : "Save username"}
                </Button>
                <Button type="button" variant="outline" onClick={state.cancel} disabled={state.isPending}>
                  Cancel
                </Button>
              </div>
            </div>
          </form>
        ) : state.currentUsername ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">@{state.currentUsername}</span>
            <Button type="button" variant="outline" size="sm" onClick={state.edit}>
              Edit
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={state.edit}>
            Add a username
          </Button>
        )}
        {state.message ? (
          <Alert className="mt-4 py-2">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}
      </dd>
    </div>
  )
}

function UsernameAvailabilityIndicator({
  availability,
  message
}: {
  availability: UsernameAvailability
  message: string | undefined
}) {
  if (availability === "idle") return null

  return (
    <InputGroupAddon align="inline-end" aria-live="polite" aria-label={message}>
      {availability === "checking" ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
      {availability === "available" ? <CircleCheckIcon className="text-green-600" aria-hidden="true" /> : null}
      {availability === "unavailable" ? <CircleXIcon className="text-destructive" aria-hidden="true" /> : null}
    </InputGroupAddon>
  )
}
