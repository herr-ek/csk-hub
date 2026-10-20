import "server-only"

import { notFound, redirect } from "next/navigation"
import { AuthorizationDeniedError, can, requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { loginPath, memberProfilePath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { findDirectConversation } from "@/features/messaging/reading"
import { getOwnVoiceCapabilities } from "./edit-profile/service"
import { getMemberProfile, InactiveViewerError, listMemberDirectory, requireActiveViewer } from "./service"

async function getViewer(returnTo: string = ROUTES.members) {
  try {
    return await requirePermission({ action: "app.access" })
  } catch (error) {
    if (error instanceof AuthorizationDeniedError) redirect(loginPath(returnTo))
    throw error
  }
}

export async function getProfile(memberId?: string) {
  const actor = await getViewer(memberId ? memberProfilePath(memberId) : ROUTES.account)
  try {
    const targetId = memberId ?? actor.userId
    const canMessage = targetId !== actor.userId && !actor.impersonatedBy
    const profile = await getMemberProfile(db, actor.userId, targetId)
    if (!profile) notFound()
    const context = { member: { id: profile.id, banned: profile.banned } }
    await requirePermission({ action: "member.read", context })
    const [readEmail, canEditProfile, messageConversationId] = await Promise.all([
      can({ action: "member.readEmail", context }),
      can({ action: "member.editProfile", context }),
      canMessage ? findDirectConversation(db, actor.userId, targetId) : Promise.resolve(null)
    ])
    const { banned: _banned, ...visibleProfile } = profile
    return {
      profile: { ...visibleProfile, email: readEmail ? profile.email : null },
      canMessage,
      messageConversationId,
      canEditProfile
    }
  } catch (error) {
    if (error instanceof InactiveViewerError || error instanceof AuthorizationDeniedError) notFound()
    throw error
  }
}

export async function getProfileEditor() {
  const actor = await getViewer(ROUTES.accountEditProfile)
  try {
    const member = await requireActiveViewer(db, actor.userId)
    await requirePermission({ action: "member.editProfile", context: { member } })
    return await getOwnVoiceCapabilities(db, actor.userId)
  } catch (error) {
    if (error instanceof InactiveViewerError || error instanceof AuthorizationDeniedError) notFound()
    throw error
  }
}

export async function getDirectory(options: { query?: string; page?: number }) {
  const actor = await getViewer()
  try {
    return await listMemberDirectory(db, actor.userId, options)
  } catch (error) {
    if (error instanceof InactiveViewerError) notFound()
    throw error
  }
}
