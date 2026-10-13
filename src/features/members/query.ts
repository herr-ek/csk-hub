import "server-only"

import { notFound, redirect } from "next/navigation"
import { getRequestSession } from "@/core/auth/session.server"
import { db } from "@/core/db"
import { loginPath, memberProfilePath } from "@/core/navigation/navigation-utils"
import { ROUTES } from "@/core/navigation/site"
import { findDirectConversation } from "@/features/messaging/reading"
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
    const profile = await getMemberProfile(db, session.user.id, memberId ?? session.user.id)
    if (!profile) notFound()
    const canMessage = !profile.isOwn && !session.session.impersonatedBy
    return {
      profile,
      canMessage,
      messageConversationId: canMessage ? await findDirectConversation(db, session.user.id, profile.id) : null,
      canEditProfile: profile.isOwn && !session.session.impersonatedBy
    }
  } catch (error) {
    if (error instanceof InactiveViewerError) notFound()
    throw error
  }
}

export async function getProfileEditor() {
  const session = await getViewer(ROUTES.accountEditProfile)
  if (session.session.impersonatedBy) notFound()
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
