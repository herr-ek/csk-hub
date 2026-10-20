"use client"

import type { ReactNode } from "react"
import { ValidationMessagesContext } from "@/shared/forms/validation-messages"
import { useValidationMessage } from "./validation-errors"

/** Connects shared field validation to the enclosing NextIntlClientProvider's locale. */
export function LocalizedFormProvider({ children }: { children: ReactNode }) {
  const format = useValidationMessage()
  return <ValidationMessagesContext.Provider value={format}>{children}</ValidationMessagesContext.Provider>
}
