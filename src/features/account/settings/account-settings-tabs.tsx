"use client"

import type { ReactNode } from "react"
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
  return (
    <Tabs defaultValue="profile">
      <TabsList aria-label="Account settings">
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
      </TabsList>
      <TabsContent value="profile">{profile}</TabsContent>
      <TabsContent value="security" className="flex flex-col gap-6">
        {security}
      </TabsContent>
      <TabsContent value="notifications">{notifications}</TabsContent>
    </Tabs>
  )
}
