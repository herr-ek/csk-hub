import { getTranslations } from "@/core/i18n/server"
import { PageBreadcrumb } from "@/core/navigation/PageBreadcrumb"
import { listOidcClients } from "./clients.server"
import { OidcClients } from "./OidcClients"

export async function OidcClientsScreen({ discoveryUrl }: { discoveryUrl: string }) {
  const clients = await listOidcClients()
  const t = await getTranslations("OidcClients")
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <PageBreadcrumb route="adminOidcClients" />
      <h1 className="font-heading text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="min-w-0 text-sm">
        <p>{t("discoveryUrl")}</p>
        <code className="break-all">{discoveryUrl}</code>
      </div>
      <OidcClients clients={clients} />
    </main>
  )
}
