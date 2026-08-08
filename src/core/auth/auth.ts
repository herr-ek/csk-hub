import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";
import { db } from "@/core/db";
import * as schema from "@/core/db/schema/auth";
import { EmailClient } from "@/core/email";
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
    sendResetPassword: async ({ user, url }) => {
      await EmailClient().send({
        to: user.email,
        subject: "Reset your CSK Hub password",
        text: [
          `Hi ${user.name || "there"},`,
          "",
          "Someone asked to reset your CSK Hub password. Open this link to choose a new one:",
          "",
          url,
          "",
          "If this wasn't you, ignore this email — your password stays as it is.",
        ].join("\n"),
      });

      // Better Auth answers the request identically whether or not the address
      // exists, so a send failure can only be reported to the server log.
      // if (!result.ok) {
      //   console.error(
      //    `[auth] could not send password reset email: ${result.error.message}`,
      //   );
      // }
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
