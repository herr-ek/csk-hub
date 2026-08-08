import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins/admin'
import { db } from '@/core/db'
import * as schema from '@/core/db/schema/auth'
import { EmailClient } from '@/core/email'
import { adminPluginOptions } from './permissions'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await EmailClient().send({
        to: user.email,
        subject: 'Reset your CSK Hub password',
        text: [
          `Hi ${user.name || 'there'},`,
          '',
          'Someone asked to reset your CSK Hub password. Open this link to choose a new one:',
          '',
          url,
          '',
          "If this wasn't you, ignore this email — your password stays as it is.",
        ].join('\n'),
      })
    },
  },
  baseUrl: {
    allowedHosts: ['*.vercel.app'],
    fallback: process.env.BETTER_AUTH_URL,
  },
  plugins: [admin(adminPluginOptions)],
})
