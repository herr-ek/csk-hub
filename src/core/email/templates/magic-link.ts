import type { EmailMessage } from "../types"

export function magicLinkTemplate(url: string): Pick<EmailMessage, "subject" | "body"> {
  return {
    subject: "Activate your CSK account",
    body: `Click the link below to activate your CSK account and set your password:\n\n${url}\n\nIf you did not expect this email, please ignore it.`
  }
}
