import { canReceiveDirectMessages } from "../../model/direct-conversation"

export type InboxConversationRow = {
  conversationId: string
  otherMemberId: string | null
  otherMemberName: string | null
  otherMemberBanned: boolean | null
  latestMessageText: string
  latestMessageSentAt: Date
  unreadCount: number
}

export type InboxConversation = {
  id: string
  otherMemberName: string | null
  preview: string
  sentAt: Date
  unreadCount: number
  canSend: boolean
}

export function toInboxConversations(rows: readonly InboxConversationRow[]): InboxConversation[] {
  return rows
    .map((row) => ({
      id: row.conversationId,
      otherMemberName: row.otherMemberName,
      preview: row.latestMessageText,
      sentAt: row.latestMessageSentAt,
      unreadCount: Number(row.unreadCount),
      canSend: canReceiveDirectMessages({
        exists: Boolean(row.otherMemberId),
        banned: row.otherMemberBanned ?? false
      })
    }))
    .sort((first, second) => second.sentAt.getTime() - first.sentAt.getTime())
}


