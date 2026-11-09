import { z } from "zod"

const envSchema = z
  .object({
    ENVIRONMENT: z.enum(["development", "test", "production"]).default("development"),

    POSTGRES_URL: z.string(),

    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    BETTER_AUTH_SECRET: z.string(),

    EMAIL_MODE: z.enum(["log", "smtp"]).default("log"),
    SMTP_HOST: z.string().default("smtp.gmail.com"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.email().optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.email().optional(),

    LOG_DATABASE: z.enum(["true", "false"]).default("false"),

    // TODO: Validate these more precisely
    VAPID_PUBLIC_KEY: z.string(),
    VAPID_PRIVATE_KEY: z.string(),
    CONTACT_EMAIL: z.email().default("webmaster@choir.chs.chalmers.se")
  })
  .superRefine((data, context) => {
    if (data.EMAIL_MODE === "smtp") {
      if (!data.SMTP_USER) {
        context.addIssue({
          code: "custom",
          path: ["SMTP_USER"],
          message: "Required when EMAIL_MODE is smtp"
        })
      }
      if (!data.SMTP_PASSWORD) {
        context.addIssue({
          code: "custom",
          path: ["SMTP_PASSWORD"],
          message: "Required when EMAIL_MODE is smtp"
        })
      }
      if (!data.SMTP_FROM)
        context.addIssue({ code: "custom", path: ["SMTP_FROM"], message: "Required when EMAIL_MODE is smtp" })
    }
  })

// An empty variable counts as unset, so a blank entry in the stack's environment falls back to
// the default or to "not configured" instead of failing validation.
const setVariables = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""))

const parsed = envSchema.safeParse(setVariables)
if (!parsed.success) {
  console.error("❌ Invalid environment variables:", JSON.stringify(z.treeifyError(parsed.error), null, 2))
  process.exit(1)
}

const env = parsed.data
const isProduction = env.ENVIRONMENT === "production"

export { env, isProduction }
