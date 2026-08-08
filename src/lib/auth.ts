import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  baseUrl: {
    allowedHosts: ["*.vercel.app"],
    fallback: process.env.BETTER_AUTH_URL,
  },
});
