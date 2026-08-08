import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema/auth";
import { sendEmail } from "@/lib/email";
import { ADMIN_ROLES, DEFAULT_ROLE, roles } from "./roles";

/**
 * Shown when an Inactive Member tries to sign in. The `admin` plugin calls this
 * a ban; the domain calls it withdrawn access (see ADR-0003).
 */
export const INACTIVE_MEMBER_MESSAGE =
  "This account is no longer active. Contact an Admin if you think that is a mistake.";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    async sendResetPassword({ user, url }) {
      await sendEmail({
        to: user.email,
        subject: "Set your CSK Hub password",
        body: `Set your password here: ${url}`,
      });
    },
  },
  baseUrl: {
    allowedHosts: ["*.vercel.app"],
    fallback: process.env.BETTER_AUTH_URL,
  },
  plugins: [
    admin({
      defaultRole: DEFAULT_ROLE,
      adminRoles: ADMIN_ROLES,
      roles,
      bannedUserMessage: INACTIVE_MEMBER_MESSAGE,
    }),
  ],
});
