import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "@/core/i18n/server"
import { Skeleton } from "@/shared/ui/base/skeleton"
import { getMember } from "./member-search"
import { StartConversationComposer } from "./start-conversation-composer"

export async function NewConversationScreen({ recipientId }: { recipientId: string }) {
  const [member, t] = await Promise.all([getMember(recipientId), getTranslations("Messages")])

  if (!member) notFound()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/messages" className="text-sm text-muted-foreground underline">
          {t("title")}
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold">{member.name}</h1>
      </div>
      <StartConversationComposer recipientId={member.id} />
    </main>
  )
}

export function NewConversationScreenSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <Skeleton className="h-48 w-full" />
    </main>
  )
}
