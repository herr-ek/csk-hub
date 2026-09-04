import Link from "next/link"
import { ROUTES } from "@/core/navigation/site"
import { buttonVariants } from "@/shared/ui/base/button"

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-4 py-8 sm:px-6">
      <h1 className="font-heading text-2xl font-semibold">Welcome to CSK Hub</h1>
      <p className="text-sm text-muted-foreground">Everything the choir publishes now has a home here.</p>
      <Link href={ROUTES.news} className={buttonVariants()}>
        Read the news
      </Link>
    </main>
  )
}
