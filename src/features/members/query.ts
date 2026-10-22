import "server-only"

import { notFound, redirect } from "next/navigation"
import { isUserAdmin } from "@/core/auth/permissions.server"
import { getRequestSession } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { loginPath, memberProfilePath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { findDirectConversation } from "@/features/messaging/reading"
import {
  listAppointmentsOfUser,
  listDirectMembershipsOfUser,
  listLocalizedGroupLabels
} from "@/features/org-structure-management"
import { getOwnVoiceCapabilities } from "./edit-profile/service"
import { getMemberProfile, InactiveViewerError, listMemberDirectory } from "./service"

async function getViewer(returnTo: string = ROUTES.members) {
  const session = await getRequestSession()
  if (!session) redirect(loginPath(returnTo))
  return session
}

export async function getProfile(memberId?: string) {
  const session = await getViewer(memberId ? memberProfilePath(memberId) : ROUTES.account)
  try {
    const targetId = memberId ?? session.user.id
    const canMessage = targetId !== session.user.id && !session.session.impersonatedBy
    const [profile, messageConversationId] = await Promise.all([
      getMemberProfile(db, session.user.id, targetId),
      canMessage ? findDirectConversation(db, session.user.id, targetId) : Promise.resolve(null)
    ])
    if (!profile) notFound()
    const labels = await listLocalizedGroupLabels()
    const groupLabel = (id: string) => labels.get(id) ?? id
    const namedGroup = <T extends { groupId: string }>(item: T) => ({ ...item, name: groupLabel(item.groupId) })
    const localizedProfile = {
      ...profile,
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
    const canManageOrganisation = await isUserAdmin(session)
    const managementRecords = canManageOrganisation
      ? await Promise.all([listAppointmentsOfUser(db, targetId), listDirectMembershipsOfUser(db, targetId)]).then(
          ([appointments, memberships]) => ({
            appointments: appointments.map((item) => ({ ...item, contextName: groupLabel(item.contextGroupId) })),
            memberships: memberships.map((item) => ({ ...item, groupName: groupLabel(item.groupId) }))
          })
        )
      : null
    return {
      profile: localizedProfile,
      canManageOrganisation,
      managementRecords,
      canMessage,
      messageConversationId,
      canEditProfile: profile.isOwn && !session.session.impersonatedBy
    }
  } catch (error) {
    if (error instanceof InactiveViewerError) notFound()
    throw error
  }
}

export async function getProfileEditor() {
  const session = await getViewer(ROUTES.accountEditProfile)
  try {
    return await getOwnVoiceCapabilities(db, session.user.id)
  } catch (error) {
    if (error instanceof InactiveViewerError) notFound()
    throw error
  }
}

export async function getDirectory(options: { query?: string; page?: number }) {
  const session = await getViewer()
  try {
    return await listMemberDirectory(db, session.user.id, options)
  } catch (error) {
    if (error instanceof InactiveViewerError) notFound()
    throw error
  }
}
