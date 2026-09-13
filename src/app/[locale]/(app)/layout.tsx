import { AppNavigation } from "@/core/navigation/app-navigation"

export default function AuthenticatedAppLayout({
  children
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <>
      <AppNavigation />
      {children}
    </>
  )
}
