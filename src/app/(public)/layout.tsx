import type { ReactNode } from "react"
import { CenteredPage } from "@/shared/layouts/centered-page"

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <CenteredPage>{children}</CenteredPage>
}
