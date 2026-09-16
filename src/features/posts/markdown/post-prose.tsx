import type { ReactNode } from "react"
import { cn } from "@/shared/utils"
import "./post-prose.css"

/**
 * The reading surface for a Post body, wrapped around both the editor and the
 * server-rendered output. ADR-0004 asks for one prose stylesheet: it is imported here
 * and nowhere else, so neither surface can get the typography any other way.
 */
export function PostProse({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("post-prose", className)}>{children}</div>
}
