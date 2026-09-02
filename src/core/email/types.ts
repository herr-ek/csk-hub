export type EmailMode = "smtp" | "log"

export type SmtpConfig = {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  from: string
}

export type EmailMessage = {
  to: string
  subject: string
  body: string
}

export type EmailSendResult =
  | { ok: true; delivery: "smtp" | "logged"; messageId: string }
  | { ok: false; reason: "invalid-message" | "transport-error"; error: string }

export type EmailBatchResult = EmailSendResult & { to: string }

export type EmailClientOptions = {
  mode?: EmailMode
  smtp?: SmtpConfig
  logger?: Pick<Console, "log" | "error">
  sendMail?: (message: { from: string; to: string; subject: string; text: string }) => Promise<{ messageId: string }>
}
