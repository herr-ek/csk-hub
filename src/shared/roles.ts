export const MEMBER_ROLE = "member"
export const ADMIN_ROLE = "admin"

export const accessRoleNames = [MEMBER_ROLE, ADMIN_ROLE] as const
export type AccessRole = (typeof accessRoleNames)[number]

export function parseRoles(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : []
  return values
    .filter((role): role is string => typeof role === "string")
    .map((role) => role.trim())
    .filter(Boolean)
}

export function hasRole(value: unknown, role: string): boolean {
  return parseRoles(value).includes(role)
}

export function hasAdminRole(value: unknown): boolean {
  return hasRole(value, ADMIN_ROLE)
}
