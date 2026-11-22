import { z } from "zod"
import { claimGroupIds, type OAuthCatalogue, standardLoginScopes } from "@/core/auth/oauth-catalogue"

const clientId = z.string().min(1)

/**
 * The command schema for admin client changes. Login scopes (`profile`, `email`, `user:` entries)
 * and API scopes (`api:` entries) are checked against separate lists, so each kind of scope is
 * rejected on the wrong side.
 */
export function createClientCommandSchema(catalogue: OAuthCatalogue) {
  const loginScopes = [...standardLoginScopes, ...catalogue.userScopes.map((entry) => entry.scope)]
  const apiScopes = catalogue.apiScopes.map((entry) => entry.scope)
  const oneOf = (allowed: readonly string[]) => z.string().refine((value) => allowed.includes(value))

  const details = z.object({
    name: z.string().trim().min(1).max(200),
    signIn: z.boolean(),
    redirectUrls: z.array(z.url()).max(20),
    scopes: z.array(oneOf(loginScopes)),
    claimGroups: z.array(z.enum(claimGroupIds)),
    clientCredentialsScopes: z.array(oneOf(apiScopes))
  })

  return z
    .discriminatedUnion("action", [
      details.extend({ action: z.literal("create") }),
      details.extend({ action: z.literal("edit"), clientId }),
      z.object({ action: z.literal("rotate"), clientId }),
      z.object({ action: z.literal("disable"), clientId, disabled: z.boolean() })
    ])
    .superRefine((command, ctx) => {
      if (command.action !== "create" && command.action !== "edit") return
      if (command.signIn && command.redirectUrls.length === 0) {
        ctx.addIssue({ code: "custom", path: ["redirectUrls"], message: "redirectUrls required" })
      }
      if (!command.signIn && command.scopes.length > 0) {
        ctx.addIssue({ code: "custom", path: ["scopes"], message: "login scopes need sign-in" })
      }
      if (!command.signIn && command.claimGroups.length > 0) {
        ctx.addIssue({ code: "custom", path: ["claimGroups"], message: "claim groups need sign-in" })
      }
      if (!command.signIn && command.clientCredentialsScopes.length === 0) {
        ctx.addIssue({ code: "custom", path: ["clientCredentialsScopes"], message: "access required" })
      }
    })
}
