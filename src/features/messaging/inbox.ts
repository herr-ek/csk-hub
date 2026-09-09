export type InboxConversationRow = {
  conversationId: string
  otherMemberName: string | null
  otherMemberIsActive: boolean
  latestMessageText: string
  latestMessageSentAt: Date
  unreadCount: number
}

export type InboxConversation = {
  id: string
  otherMemberName: string
  preview: string
  sentAt: Date
  unreadCount: number
  readOnly: boolean
}

export function toInboxConversations(rows: readonly InboxConversationRow[]): InboxConversation[] {
  return rows
    .map((row) => ({
      id: row.conversationId,
      otherMemberName: row.otherMemberName ?? "Former member",
      preview: row.latestMessageText,
      sentAt: row.latestMessageSentAt,
      unreadCount: Number(row.unreadCount),
      readOnly: !row.otherMemberName || !row.otherMemberIsActive
    }))
    .sort((first, second) => second.sentAt.getTime() - first.sentAt.getTime())
}
