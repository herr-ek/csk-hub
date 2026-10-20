/** Actions implemented against today's schema. No Group Post or Event instance policy is implied. */
export type PermissionRequest =
  | { action: "post.create" }
  | {
      action: "post.read" | "post.update" | "post.publish" | "post.unpublish" | "post.discard"
      postId: string
    }
  | {
      action:
        | "group.publishPost"
        | "group.manageContent"
        | "group.manageEvents"
        | "group.manageMemberships"
        | "group.managePositions"
      groupId: string
    }
  | { action: "member.read" | "member.readEmail" | "member.editProfile"; memberId: string }
  | { action: "admin.access" | "org.manage" | "user.administer" | "notification.broadcast" }

/** Effective User identity; impersonatedBy preserves the support actor for attribution. */
export type AuthorizationActor = Readonly<{
  userId: string
  isAdmin: boolean
  impersonatedBy: string | null
}>

/** Only a trusted server session resolver may produce this, never a submitted form or client. */
export type AuthorizationSession = {
  user: { id: string }
  session: { impersonatedBy?: string | null }
}
