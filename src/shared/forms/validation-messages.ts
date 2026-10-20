"use client"

import { createContext, useContext } from "react"

export type ValidationIssue = {
  message?: string
  minimum?: number | bigint
  params?: Record<string, string | number>
}

export type ValidationFormatter = (issue: ValidationIssue | string | undefined) => string | undefined

function missingValidationFormatter(): never {
  throw new Error("Validation errors require a formatter provider.")
}

/** Supply a formatter when rendering validator issues; already-formatted `error` content needs no formatter. */
export const ValidationMessagesContext = createContext<ValidationFormatter>(missingValidationFormatter)

/** Returns the field formatter, which throws if called without a provided value. Fields without validator errors need none. */
export function useValidationFormatter() {
  return useContext(ValidationMessagesContext)
}
