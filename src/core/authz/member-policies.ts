import type { AuthorizationActor, AuthorizationPolicies, PermissionContext } from "./model"

function canReadMember(_actor: AuthorizationActor, { member }: PermissionContext["member.read"]): boolean {
  return member !== null && member.banned !== true
}

function canReadMemberEmail(actor: AuthorizationActor, { member }: PermissionContext["member.readEmail"]): boolean {
  return member !== null && member.banned !== true && member.id === actor.userId
}

function canEditMemberProfile(actor: AuthorizationActor, { member }: PermissionContext["member.editProfile"]): boolean {
  return member !== null && member.banned !== true && member.id === actor.userId && actor.impersonatedBy === null
}

/** Shared-profile privacy has no implicit Admin or support-impersonation bypass. */
export const memberPolicies = {
  "member.read": canReadMember,
  "member.readEmail": canReadMemberEmail,
  "member.editProfile": canEditMemberProfile
} satisfies Pick<AuthorizationPolicies, `member.${string}` & keyof AuthorizationPolicies>
