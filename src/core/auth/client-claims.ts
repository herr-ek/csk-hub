import { eq } from "drizzle-orm"
import { z } from "zod"
import type { Database } from "@/core/db"
import { oauthClient } from "@/core/db/schema/auth"
import { type ClaimGroupId, claimGroupIds } from "./oauth-catalogue"

/**
 * The only module that reads or writes the Hub's claim settings on an OAuth client. They live in
 * `metadata.csk`, a key of the plugin's free-form jsonb column. The plugin keeps its own keys in
 * that object, so a write must merge `csk` into the current metadata, never replace the whole
 * object.
 */

const cskKey = "csk"

const storedMetadata = z.object({
  [cskKey]: z.object({ releasedClaims: z.array(z.string()) }).optional()
})

/**
 * The claim groups a client has enabled. Unknown ids and malformed metadata are ignored, so a bad
 * stored value can never release a claim the catalogue does not define.
 */
function releasedClaimsFrom(metadata: unknown): ClaimGroupId[] {
  const parsed = storedMetadata.safeParse(metadata)
  if (!parsed.success) return []
  const enabled = parsed.data[cskKey]?.releasedClaims ?? []
  return claimGroupIds.filter((id) => enabled.includes(id))
}

/**
 * The client metadata to store with `releasedClaims` set. Replaces only the `csk` key and keeps
 * every other key from `current`. Pass the metadata read by `readClientMetadata`.
 */
export function withReleasedClaims(
  current: Record<string, unknown> | null | undefined,
  releasedClaims: readonly ClaimGroupId[]
): Record<string, unknown> {
  return { ...current, [cskKey]: { releasedClaims: [...releasedClaims] } }
}

/** The client's stored metadata, or undefined when no client has this id. */
export async function readClientMetadata(
  database: Database,
  clientId: string
): Promise<Record<string, unknown> | null | undefined> {
  const [row] = await database
    .select({ metadata: oauthClient.metadata })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
  if (!row) return undefined
  return isRecord(row.metadata) ? row.metadata : null
}

/** The settings UserInfo needs for a client, or undefined when no client has this id. */
export async function readClaimSettings(
  database: Database,
  clientId: string
): Promise<{ disabled: boolean; releasedClaims: ClaimGroupId[] } | undefined> {
  const [row] = await database
    .select({ disabled: oauthClient.disabled, metadata: oauthClient.metadata })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
  if (!row) return undefined
  return { disabled: row.disabled ?? false, releasedClaims: releasedClaimsFrom(row.metadata) }
}

/** The enabled claim groups for every client, keyed by client id, for the admin list. */
export async function readReleasedClaimsByClient(database: Database): Promise<Map<string, ClaimGroupId[]>> {
  const rows = await database
    .select({ clientId: oauthClient.clientId, metadata: oauthClient.metadata })
    .from(oauthClient)
  return new Map(rows.map((row) => [row.clientId, releasedClaimsFrom(row.metadata)]))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
