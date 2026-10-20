import "server-only"

import { notFound, redirect } from "next/navigation"
import { AuthorizationDeniedError, can, requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { loginPath, memberProfilePath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { findDirectConversation } from "@/features/messaging/reading"
import { getOwnVoiceCapabilities } from "./edit-profile/service"
import { getMemberProfile, InactiveViewerError, listMemberDirectory } from "./service"

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
    await requirePermission({ action: "member.read", memberId: targetId })
    const canMessage = targetId !== actor.userId && !actor.impersonatedBy
    const profile = await getMemberProfile(db, actor.userId, targetId)
    if (!profile) notFound()
    const [readEmail, canEditProfile, messageConversationId] = await Promise.all([
      can({ action: "member.readEmail", memberId: targetId }),
      can({ action: "member.editProfile", memberId: targetId }),
      canMessage ? findDirectConversation(db, actor.userId, targetId) : Promise.resolve(null)
    ])
    return {
      profile: { ...profile, email: readEmail ? profile.email : null },
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
    await requirePermission({ action: "member.editProfile", memberId: actor.userId })
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
