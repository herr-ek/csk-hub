type ErrorRecord = Record<string, unknown>

export function getErrorCode(error: unknown): string {
  return getStringProperty(error, "code") ?? getNestedStringProperty(error, "body", "code") ?? "unknown"
}

export function getErrorName(error: unknown): string {
  if (error instanceof Error) return error.name
  return getStringProperty(error, "name") ?? "UnknownError"
}

export function getErrorStatus(error: unknown): number {
  return getNumberProperty(error, "status") ?? getNumberProperty(error, "statusCode") ?? 0
}

function getStringProperty(error: unknown, property: string): string | undefined {
  if (!isErrorRecord(error)) return undefined
  return typeof error[property] === "string" ? error[property] : undefined
}

function getNumberProperty(error: unknown, property: string): number | undefined {
  if (!isErrorRecord(error)) return undefined
  return typeof error[property] === "number" ? error[property] : undefined
}

function getNestedStringProperty(error: unknown, parent: string, property: string): string | undefined {
  if (!isErrorRecord(error)) return undefined
  return getStringProperty(error[parent], property)
}

function isErrorRecord(error: unknown): error is ErrorRecord {
  return typeof error === "object" && error !== null
}
