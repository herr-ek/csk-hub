import "server-only"

import nodemailer from "nodemailer"
import { env } from "@/core/config/env"
import type { EmailBatchResult, EmailClientOptions, EmailMessage, EmailSendResult, SmtpConfig } from "./types"

const DEFAULT_CONCURRENCY = 5

export function createSmtpConfig(): SmtpConfig | null {
  if (!env.SMTP_USER || !env.SMTP_PASSWORD || !env.SMTP_FROM) return null

  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
    user: env.SMTP_USER,
    pass: env.SMTP_PASSWORD,
    from: env.SMTP_FROM
  }
}

export function createEmailClient(options: EmailClientOptions = {}) {
  const mode = options.mode ?? env.EMAIL_MODE
  const log = options.logger ?? console
  const smtp = options.smtp ?? createSmtpConfig()

  async function send(message: EmailMessage): Promise<EmailSendResult> {
    const invalidMessage = validateMessage(message)
    if (invalidMessage) return { ok: false, reason: "invalid-message", error: invalidMessage }

    if (mode === "log" || !smtp) {
      const messageId = `log-${crypto.randomUUID()}`
      log.log("[email:log]", { messageId, ...message })
      return { ok: true, delivery: "logged", messageId }
    }

    try {
      const sendMail =
        options.sendMail ??
        ((outgoing) =>
          nodemailer
            .createTransport({
              host: smtp.host,
              port: smtp.port,
              secure: smtp.secure,
              auth: { user: smtp.user, pass: smtp.pass },
              requireTLS: true
            })
            .sendMail(outgoing))
      const result = await sendMail({ from: smtp.from, to: message.to, subject: message.subject, text: message.body })
      return { ok: true, delivery: "smtp", messageId: result.messageId }
    } catch (error) {
      log.error("[email:transport-error]", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        to: message.to
      })
      return { ok: false, reason: "transport-error", error: "Email could not be delivered." }
    }
  }

  async function sendBatch(
    messages: readonly EmailMessage[],
    concurrency = DEFAULT_CONCURRENCY
  ): Promise<EmailBatchResult[]> {
    const limit = Math.max(1, Math.floor(concurrency))
    const results: EmailBatchResult[] = []

    for (let index = 0; index < messages.length; index += limit) {
      const batch = await Promise.all(
        messages.slice(index, index + limit).map(async (message) => ({ to: message.to, ...(await send(message)) }))
      )
      results.push(...batch)
    }

    return results
  }

  return { send, sendBatch }
}

function validateMessage(message: EmailMessage): string | null {
  if (!message.to.trim()) return "An email recipient is required."
  if (!message.subject.trim()) return "An email subject is required."
  if (!message.body.trim()) return "An email body is required."
  return null
}

const emailClient = createEmailClient()

export function sendEmail(message: EmailMessage): Promise<EmailSendResult> {
  return emailClient.send(message)
}

export function sendEmails(
  messages: readonly EmailMessage[],
  options: { concurrency?: number } = {}
): Promise<EmailBatchResult[]> {
  return emailClient.sendBatch(messages, options.concurrency)
}
