"use client"

import { useDebouncedValue } from "@tanstack/react-pacer/debouncer"
import { useEffect, useState } from "react"
import { authClient } from "@/core/auth/auth-client"

export type UsernameAvailability = "idle" | "checking" | "available" | "unavailable"

export function useUsernameSettings(initialUsername: string) {
  const [currentUsername, setCurrentUsername] = useState(initialUsername)
  const [username, setUsername] = useState(initialUsername)
  const [isEditing, setIsEditing] = useState(false)
  const [availability, setAvailability] = useState<UsernameAvailability>("idle")
  const [availabilityMessage, setAvailabilityMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [isPending, setIsPending] = useState(false)
  const [debouncedUsername] = useDebouncedValue(username, { wait: 300 })

  const canSave = username !== currentUsername && availability === "available" && !isPending

  useEffect(() => {
    if (!isEditing || username === currentUsername) {
      setAvailability("idle")
      setAvailabilityMessage(undefined)
      return
    }

    setAvailability("checking")
    setAvailabilityMessage("Checking username availability.")
  }, [currentUsername, isEditing, username])

  useEffect(() => {
    if (!isEditing || username === currentUsername || username !== debouncedUsername) return

    let cancelled = false

    async function checkAvailability() {
      try {
        const result = await authClient.isUsernameAvailable({ username })
        if (cancelled) return

        if (result.error) {
          setAvailability("unavailable")
          setAvailabilityMessage(result.error.message)
          return
        }

        setAvailability(result.data?.available ? "available" : "unavailable")
        setAvailabilityMessage(result.data?.available ? "Username is available." : "Username is already taken.")
      } catch {
        if (cancelled) return
        setAvailability("unavailable")
        setAvailabilityMessage("Unable to check username availability.")
      }
    }

    checkAvailability()

    return () => {
      cancelled = true
    }
  }, [currentUsername, debouncedUsername, isEditing, username])

  function edit() {
    setUsername(currentUsername)
    setMessage(undefined)
    setError(undefined)
    setAvailability("idle")
    setIsEditing(true)
  }

  function cancel() {
    setUsername(currentUsername)
    setError(undefined)
    setAvailability("idle")
    setIsEditing(false)
  }

  function changeUsername(value: string) {
    setError(undefined)
    setUsername(value)
  }

  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave) return

    setMessage(undefined)
    setError(undefined)
    setIsPending(true)
    try {
      const result = await authClient.updateUser({ username })

      if (result.error) {
        setError(result.error.message)
        return
      }

      setCurrentUsername(username)
      setIsEditing(false)
      setAvailability("idle")
      setMessage("Username updated.")
    } catch {
      setError("Unable to update your username right now. Please try again.")
    } finally {
      setIsPending(false)
    }
  }

  return {
    availability,
    availabilityMessage,
    canSave,
    cancel,
    changeUsername,
    currentUsername,
    edit,
    error,
    isEditing,
    isPending,
    message,
    save,
    username
  }
}
