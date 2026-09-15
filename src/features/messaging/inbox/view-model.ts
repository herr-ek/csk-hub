export type InboxConversationRow = {
  conversationId: string
  otherMemberName: string | null
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
  readOnly: boolean
}

export function toInboxConversations(rows: readonly InboxConversationRow[]): InboxConversation[] {
  return rows
    .map((row) => ({
      id: row.conversationId,
      otherMemberName: row.otherMemberName,
      preview: row.latestMessageText,
      sentAt: row.latestMessageSentAt,
      unreadCount: Number(row.unreadCount),
      readOnly: !row.otherMemberName
    }))
    .sort((first, second) => second.sentAt.getTime() - first.sentAt.getTime())
}
