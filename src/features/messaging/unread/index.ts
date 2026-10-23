import { registerUnreadSource } from "@/core/navigation/unread-sources"
import { countUnreadConversations } from "./service"

// Importing this entry subscribes the Messages navigation badge to unread Conversations.
registerUnreadSource("messages", countUnreadConversations)

export { countUnreadConversations }
