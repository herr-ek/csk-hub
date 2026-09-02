import type { ReactNode } from "react"

export function CenteredPage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-sm flex-col justify-center px-4 py-8">
      <div className="flex flex-col gap-6">{children}</div>
    </main>
  )
}
