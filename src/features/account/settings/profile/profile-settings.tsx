import { useTranslations } from "@/core/i18n/translations"
import { Card, CardContent } from "@/shared/ui/base/card"
import { EmailVerification } from "./email-verification"
import { UsernameSetting } from "./username-setting"

export function ProfileSettings({
  member
}: {
  member: { name: string; email: string; emailVerified: boolean; username?: string | null }
}) {
  const t = useTranslations("AccountSettings")
  const common = useTranslations("Common")
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <dl>
            <div>
              <dt className="text-sm font-medium">{t("name")}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{member.name}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium">{common("email")}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">
                <EmailVerification email={member.email} initialVerified={member.emailVerified} />
              </dd>
            </div>
            <UsernameSetting initialUsername={member.username ?? ""} />
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
