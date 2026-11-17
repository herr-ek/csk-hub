import "server-only"

import { notFound, redirect } from "next/navigation"
import { AuthorizationDeniedError, can, requirePermission } from "@/core/authz"
import { db } from "@/core/db"
import { loginPath, memberProfilePath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { findDirectConversation } from "@/features/messaging/reading"
import { listLocalizedGroupLabels } from "@/features/org-structure"
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
    const canMessage = targetId !== actor.userId
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
    const labels = await listLocalizedGroupLabels()
    const groupLabel = (id: string) => labels.get(id) ?? id
    const namedGroup = <T extends { groupId: string }>(item: T) => ({ ...item, name: groupLabel(item.groupId) })
    const localizedProfile = {
      ...visibleProfile,
      email: readEmail ? profile.email : null,
      choirs: profile.choirs.map((choir) => ({
        ...namedGroup(choir),
        section: choir.section ? namedGroup(choir.section) : null,
        groups: choir.groups.map(namedGroup)
      })),
      groups: profile.groups.map(namedGroup),
      otherGroups: profile.otherGroups.map(namedGroup),
      positions: profile.positions.map((position) => ({
        ...position,
        contextName: groupLabel(position.contextGroupId),
        groups: position.groups.map((item) => ({ ...item, name: groupLabel(item.id) }))
      }))
    }
    return {
      profile: localizedProfile,
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
