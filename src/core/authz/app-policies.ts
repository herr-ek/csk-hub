import type { AuthorizationPolicies } from "./model"

function canAccessApp(): boolean {
  return true
}

/** Baseline application access. The evaluator requires an active actor before invoking any policy. */
export const appPolicies = {
  "app.access": canAccessApp
} satisfies Pick<AuthorizationPolicies, `app.${string}` & keyof AuthorizationPolicies>
