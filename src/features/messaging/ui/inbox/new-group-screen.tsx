import Link from "next/link"
import { getTranslations } from "@/core/i18n/server"
import { GroupCommandForm } from "../conversation/group-command-form"

export async function NewGroupConversationScreen() {
  const t = await getTranslations("Messages")
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <Link href="/messages" className="text-sm text-muted-foreground underline">
          {t("title")}
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-semibold">{t("createGroup")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("createGroupDescription")}</p>
      </div>
      <GroupCommandForm operation="create" />
    </main>
  )
}
