import { Card, CardContent, CardHeader } from "@/shared/ui/base/card"
import { Skeleton } from "@/shared/ui/base/skeleton"

function SettingsCardSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export function AccountSettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-6">
        <Card>
          <CardContent>
            <Skeleton className="h-4 w-12" />
            <Skeleton className="mt-2 h-4 w-48" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Skeleton className="h-4 w-12" />
              <Skeleton className="mt-2 h-4 w-52" />
            </div>
            <div>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-2 h-4 w-32" />
            </div>
          </CardContent>
        </Card>
      </div>

      <SettingsCardSkeleton>
        <div className="flex flex-col gap-5">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index}>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-2 h-9 w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-32" />
        </div>
      </SettingsCardSkeleton>

      <SettingsCardSkeleton>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-4 w-44" />
          <div>
            <Skeleton className="h-4 w-48" />
            <Skeleton className="mt-2 h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
      </SettingsCardSkeleton>

      <SettingsCardSkeleton>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-6 w-11 rounded-full" />
        </div>
      </SettingsCardSkeleton>

      <SettingsCardSkeleton>
        <Skeleton className="h-4 w-40" />
      </SettingsCardSkeleton>
    </div>
  )
}
