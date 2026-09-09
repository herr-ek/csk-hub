import type { ReactNode } from "react"

/**
 * The standard reading-width page column. Screens and their skeletons render the
 * same shell, so a skeleton occupies the space its screen will take. Pass `busy`
 * from a skeleton to announce the pending state.
 */
export function ContentPage({ children, busy }: { children: ReactNode; busy?: boolean }) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy={busy}>
      {children}
    </main>
  )
}
