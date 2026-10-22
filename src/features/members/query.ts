import "server-only"

import { notFound, redirect } from "next/navigation"
import { getRequestSession } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { loginPath, memberCareerPath, memberProfilePath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { GroupType } from "@/core/org-structure"
import { findDirectConversation } from "@/features/messaging/reading"
import { listLocalizedGroupLabels } from "@/features/org-structure-management"
import { getMemberCareer } from "./career/service"
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
    return {
      profile: localizedProfile,
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

/** Signed-in view of another member's career, or the viewer's own career when no id is supplied. */
export async function getCareer(memberId?: string) {
  const session = await getViewer(memberId ? memberCareerPath(memberId) : ROUTES.accountCareer)
  try {
    const career = await getMemberCareer(db, session.user.id, memberId ?? session.user.id)
    if (!career) notFound()
    const labels = await listLocalizedGroupLabels()
    return {
      person: career.person,
      isOwn: career.isOwn,
      through: career.through,
      records: career.records.map((record) => {
        const choirId = record.group.type === GroupType.Choir ? record.group.id : record.group.choirId
        return {
          id: record.id,
          kind: record.kind,
          groupId: record.group.id,
          groupType: record.group.type,
          label: labels.get(record.group.id) ?? record.group.name ?? record.group.id,
          scopeId: choirId,
          scopeName: choirId ? (labels.get(choirId) ?? choirId) : null,
          active: record.group.active,
          startDate: record.startDate,
          endDate: record.endDate,
          voice: record.voice,
          positionCode: record.positionCode,
          sourceContext: record.sourceContextId ? (labels.get(record.sourceContextId) ?? record.sourceContextId) : null
        }
      })
    }
  } catch (error) {
    if (error instanceof InactiveViewerError) notFound()
    throw error
  }
}
