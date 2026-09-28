import { Client } from "pg"
import { secureConnection } from "@/core/db/tls"
import { ADMIN_ROLE, parseRoles } from "@/shared/roles"
import { confirmProductionWrite } from "./guards"
import { announce, type Database } from "./target"

/**
 * Give an existing user the admin role. 
 * Allowed against prod since it requires an existing user. (Real password and/or 2FA/passkey)
 * Keeps the existing roles of the user
 *
 * Returns the exit code rather than exiting, so the interactive menu can stay open.
 */
export async function grantAdmin(
  database: Database,
  email: string,
  { skipConfirmation }: { skipConfirmation: boolean }
): Promise<number> {
  announce(database)

  if (!(await confirmProductionWrite(`Grant admin to ${email}`, database, { skip: skipConfirmation }))) return 1

  const client = new Client(secureConnection(database.url))

  try {
    await client.connect()

    const { rows } = await client.query<{ id: string; role: string | null; banned: boolean | null }>(
      `select id, role, banned from "user" where lower(email) = lower($1)`,
      [email]
    )
    const [user] = rows

    if (!user) {
      console.error(`✖ No user with email ${email} on ${database.host}.`)
      return 1
    }

    const roles = parseRoles(user.role)

    if (roles.includes(ADMIN_ROLE)) {
      console.log(`${email} is already an admin.`)
    } else {
      await client.query(`update "user" set role = $1, updated_at = now() where id = $2`, [
        [...roles, ADMIN_ROLE].join(","),
        user.id
      ])
      console.log(`Granted admin to ${email} on ${database.host}.`)
    }

    if (user.banned) console.error(`⚠  ${email} is deactivated and cannot sign in until reactivated.`)

    return 0
  } finally {
    await client.end().catch(() => {})
  }
}
