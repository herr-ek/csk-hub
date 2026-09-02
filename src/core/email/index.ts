export { sendEmail, sendEmails } from "./client"
export {
  sendMagicLinkEmail,
  sendResetPasswordEmail,
  sendTwoFactorOtpEmail,
  sendVerificationOtpEmail
} from "./senders/auth"
export type { EmailBatchResult, EmailMessage, EmailSendResult } from "./types"
