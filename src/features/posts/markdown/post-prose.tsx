import type { ReactNode } from "react"
import { cn } from "@/shared/utils"
import "./post-prose.css"

/**
 * The reading surface for a Post body, wrapped around both the editor and the
 * server-rendered output.
 *
 * ADR-0004 asks for one prose stylesheet rather than two kept in step by hand. This
 * component is how that holds: the stylesheet is imported here and nowhere else, so a
 * surface can only get the typography by going through the same wrapper the other
 * surface goes through.
 */
export function PostProse({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("post-prose", className)}>{children}</div>
}
