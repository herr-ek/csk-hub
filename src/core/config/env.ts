import { z } from "zod"

const environment = process.env.ENVIRONMENT ?? process.env.VERCEL_ENV

const envSchema = z
  .object({
    ENVIRONMENT: z.enum(["development", "test", "preview", "production"]).default("development"),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),

    POSTGRES_URL: z.string(),

    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    BETTER_AUTH_SECRET: z.string(),

    EMAIL_MODE: z.enum(["log", "smtp"]).default("log"),
    SMTP_HOST: z.string().default("smtp.gmail.com"),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_USER: z.email().optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),
    SMTP_FROM: z.email().optional(),

    LOG_DATABASE: z.enum(["true", "false"]).default("false")
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

const parsed = envSchema.safeParse({ ...process.env, ENVIRONMENT: environment })
if (!parsed.success) {
  console.error("❌ Invalid environment variables:", JSON.stringify(z.treeifyError(parsed.error), null, 2))
  process.exit(1)
}

const env = parsed.data
const isProduction = env.VERCEL_ENV === "production"

export { env, isProduction }
