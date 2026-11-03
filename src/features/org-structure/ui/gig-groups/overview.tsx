"use client"

import { useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { InputField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent } from "@/shared/ui/base/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/base/tabs"
import { CommandDialog } from "../command-dialog"
import { GroupItems } from "../group-list"
import type { GroupSummary } from "../group-summaries"
import { groupView } from "../groups/group-view"
import { NAME_MAX_LENGTH } from "../limits"
import { createGigGroupAction } from "./actions"

export function GigGroupsOverview({ groups }: { groups: GroupSummary[] }) {
  const t = useTranslations("Groups")
  const [view, setView] = useState<"current" | "archived">("current")
  return (
    <div className="flex flex-col gap-6">
      <CommandDialog
        trigger={
          <Button type="button" className="self-start">
            {t("gigGroupsPage.create")}
          </Button>
        }
        title={t("gigGroupsPage.create")}
        action={createGigGroupAction}
        submitLabel={t("create")}
      >
        <InputField label={t("name")} name="name" maxLength={NAME_MAX_LENGTH} required />
      </CommandDialog>
      <Tabs value={view} onValueChange={(value) => setView(value as "current" | "archived")} className="gap-6">
        <TabsList aria-label={t("groupsPage.viewLabel")}>
          <TabsTrigger value="current">{t("management.current")}</TabsTrigger>
          <TabsTrigger value="archived">{t("archived")}</TabsTrigger>
        </TabsList>
        <TabsContent value={view}>
          <Card>
            <CardContent>
              <GroupItems groups={groups.filter((group) => groupView(group) === view)} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
