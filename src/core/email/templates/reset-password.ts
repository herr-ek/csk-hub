import type { EmailMessage } from "../types"

export function resetPasswordTemplate({
  name,
  url
}: {
  name: string
  url: string
}): Pick<EmailMessage, "subject" | "body"> {
  return {
    subject: "Reset your CSK Hub password",
    body: [
      `Hi ${name || "there"},`,
      "",
      "Someone asked to reset your CSK Hub password. Open this link to choose a new one:",
      "",
      url,
      "",
      "If this wasn't you, ignore this email — your password stays as it is."
    ].join("\n")
  }
}
