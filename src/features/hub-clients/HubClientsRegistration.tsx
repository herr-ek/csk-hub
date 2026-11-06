import { requireAdmin } from "@/core/auth/permissions.server"
import { getTranslations } from "@/core/i18n/server"
import { HubClientRegistrationForm } from "./HubClientRegistrationForm"

export async function HubClientsRegistration() {
  await requireAdmin()
  const t = await getTranslations("HubClients")
  return (
    <section aria-labelledby="hub-clients-title" className="max-w-2xl space-y-6">
      <div className="space-y-2">
        <h2 id="hub-clients-title" className="font-heading text-xl font-semibold">
          {t("title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <HubClientRegistrationForm />
    </section>
  )
}
