import { Card, CardContent } from "@/shared/ui/base/card"
import { EmailVerification } from "./email-verification"
import { UsernameSetting } from "./username-setting"

export function ProfileSettings({
  member
}: {
  member: { name: string; email: string; emailVerified: boolean; username?: string | null }
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <dl>
            <div>
              <dt className="text-sm font-medium">Name</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{member.name}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium">Email</dt>
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
