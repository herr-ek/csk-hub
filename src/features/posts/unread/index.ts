import { registerUnreadSource } from "@/core/navigation/unread-sources"
import { countUnreadPosts } from "./service"

// Importing this entry subscribes the News feed's navigation badge to unread Posts.
registerUnreadSource("news", countUnreadPosts)

export { PostReadMarker } from "./post-read-marker"
export { listUnreadPostIds } from "./service"
