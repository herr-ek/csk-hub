import type { ReactNode } from "react"
import { cn } from "@/shared/utils"
import "./rich-text-prose.css"

/**
 * The reading surface for a document, wrapped around both the editor and the
 * server-rendered output. The stylesheet is imported here and nowhere else, so neither
 * surface can get the typography any other way.
 */
export function RichTextProse({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rich-text", className)}>{children}</div>
}
