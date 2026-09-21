import type { ReactNode } from "react"
import { cn } from "@/shared/utils"

/**
 * The standard reading-width page column, rendered by screens and their skeletons alike;
 * pass `busy` from a skeleton. `fill` takes the height left under the header from `md`
 * up, for a screen that would rather scroll a pane of its own than the viewport.
 */
export function ContentPage({ children, busy, fill }: { children: ReactNode; busy?: boolean; fill?: boolean }) {
  return (
    <main
      className={cn("mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6", fill && "md:min-h-0 md:flex-1")}
      aria-busy={busy}
    >
      {children}
    </main>
  )
}
