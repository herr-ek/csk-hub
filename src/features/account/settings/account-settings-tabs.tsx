"use client"

import type { ReactNode } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/base/tabs"

export function AccountSettingsTabs({
  profile,
  security,
  notifications
}: {
  profile: ReactNode
  security: ReactNode
  notifications: ReactNode
}) {
  const t = useTranslations("AccountSettings")
  return (
    <Tabs defaultValue="profile">
      <TabsList aria-label={t("pageTitle")}>
        <TabsTrigger value="profile">{t("profileTab")}</TabsTrigger>
        <TabsTrigger value="security">{t("securityTab")}</TabsTrigger>
        <TabsTrigger value="notifications">{t("notificationsTab")}</TabsTrigger>
      </TabsList>
      <TabsContent value="profile">{profile}</TabsContent>
      <TabsContent value="security" className="flex flex-col gap-6">
        {security}
      </TabsContent>
      <TabsContent value="notifications">{notifications}</TabsContent>
    </Tabs>
  )
}
