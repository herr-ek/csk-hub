export type LogLevel = "debug" | "info" | "warn" | "error" | "audit"

export type LogContext = Record<string, unknown>

export type LogEntry = {
  timestamp: string
  level: LogLevel
  event: string
  message?: string
  context?: LogContext
}

export type ApplicationLogger = {
  debug(event: string, context?: LogContext): void
  info(event: string, context?: LogContext): void
  warn(event: string, context?: LogContext): void
  error(event: string, context?: LogContext): void
  audit(event: string, context?: LogContext): void
}

export type LoggerOptions = {
  write?: (entry: string) => void
  now?: () => Date
}

export function createApplicationLogger(options: LoggerOptions = {}): ApplicationLogger {
  const write = options.write ?? console.log
  const now = options.now ?? (() => new Date())

  function log(level: LogLevel, event: string, context?: LogContext) {
    const entry: LogEntry = {
      timestamp: now().toISOString(),
      level,
      event,
      ...(context ? { context } : {})
    }

    try {
      write(JSON.stringify(entry))
    } catch {
      // Logging is best-effort: an unavailable sink must never break the request.
    }
  }

  return {
    debug: (event, context) => log("debug", event, context),
    info: (event, context) => log("info", event, context),
    warn: (event, context) => log("warn", event, context),
    error: (event, context) => log("error", event, context),
    audit: (event, context) => log("audit", event, context)
  }
}

export const logger = createApplicationLogger()
