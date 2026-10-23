"use client"

import { useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { InputField } from "@/shared/forms/fields"
import { Badge } from "@/shared/ui/base/badge"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldDescription, FieldLegend, FieldSet } from "@/shared/ui/base/field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import type { GroupType } from "../../model"
import { GroupCommandDialog } from "../group-command-dialog"
import { NAME_MAX_LENGTH } from "../limits"
import { createPositionAction, updatePositionAction } from "./actions"
import type { CataloguePosition, LimitGroup, PositionCatalogueData } from "./query"

const GROUP_TYPES: GroupType[] = [
  "Choir",
  "Section",
  "Board",
  "GigGroup",
  "Gigmästeri",
  "Sexmästeri",
  "Roddgrupp",
  "Festgrupp",
  "Rephelg",
  "Konsertmästeri",
  "Rekryteringskommitté",
  "Turnékommitté",
  "Valberedning",
  "Webmästeri",
  "Föräldramötet",
  "Arkivarie",
  "Utantillkommitté",
  "Övrig"
]

/** The Positions groups can hold, the group types each is allowed in, and any limit to groups. */
export function PositionCatalogue({ catalogue }: { catalogue: PositionCatalogueData }) {
  const t = useTranslations("Groups.catalogue")
  const types = useTranslations("Groups.types")
  const groupLabel = useGroupLabel()
  const { positions, groups } = catalogue

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <GroupCommandDialog
          trigger={
            <Button type="button" variant="outline">
              {t("create")}
            </Button>
          }
          title={t("create")}
          action={createPositionAction}
          submitLabel={t("create")}
        >
          <PositionFields groups={groups} />
        </GroupCommandDialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("position")}</TableHead>
              <TableHead>{t("groupTypes")}</TableHead>
              <TableHead className="sr-only">{t("edit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.id}>
                <TableCell className="font-medium">{position.name}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {position.groupTypes.length === 0 ? (
                      <span className="text-muted-foreground">{t("noGroupTypes")}</span>
                    ) : (
                      position.groupTypes.map((type) => (
                        <Badge key={type} variant="outline">
                          {types(type)}
                        </Badge>
                      ))
                    )}
                  </div>
                  {position.groups.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("limitedTo", { groups: position.groups.map(groupLabel).join(", ") })}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <GroupCommandDialog
                    trigger={
                      <Button type="button" variant="ghost" size="sm">
                        {t("edit")}
                      </Button>
                    }
                    title={t("editTitle", { name: position.name })}
                    description={t("editDescription")}
                    action={updatePositionAction}
                    submitLabel={t("save")}
                  >
                    <input type="hidden" name="positionId" value={position.id} />
                    <PositionFields position={position} groups={groups} />
                  </GroupCommandDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function PositionFields({ position, groups }: { position?: CataloguePosition; groups: LimitGroup[] }) {
  const t = useTranslations("Groups")
  const types = useTranslations("Groups.types")
  const groupLabel = useGroupLabel()
  // The limit offers only groups of the ticked types, so it follows the type checkboxes.
  const [checkedTypes, setCheckedTypes] = useState<GroupType[]>(position?.groupTypes ?? [])
  const limitable = groups.filter(({ type }) => checkedTypes.includes(type))
  const toggleType = (type: GroupType, checked: boolean) =>
    setCheckedTypes((current) => (checked ? [...current, type] : current.filter((other) => other !== type)))

  return (
    <>
      <InputField label={t("name")} name="name" defaultValue={position?.name} required maxLength={NAME_MAX_LENGTH} />
      <FieldSet>
        <FieldLegend variant="label">{t("catalogue.groupTypes")}</FieldLegend>
        <div className="grid grid-cols-2 gap-2">
          {GROUP_TYPES.map((type) => (
            <Field key={type} orientation="horizontal">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="groupTypes"
                  value={type}
                  defaultChecked={position?.groupTypes.includes(type)}
                  onChange={(event) => toggleType(type, event.target.checked)}
                  className="size-4 accent-primary"
                />
                {types(type)}
              </label>
            </Field>
          ))}
        </div>
      </FieldSet>
      {limitable.length > 0 ? (
        <FieldSet>
          <FieldLegend variant="label">{t("catalogue.limitLegend")}</FieldLegend>
          <FieldDescription>{t("catalogue.limitDescription")}</FieldDescription>
          <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto">
            {limitable.map((group) => (
              <Field key={group.id} orientation="horizontal">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="groupIds"
                    value={group.id}
                    defaultChecked={position?.groups.some(({ id }) => id === group.id)}
                    className="size-4 accent-primary"
                  />
                  {groupLabel(group)}
                </label>
              </Field>
            ))}
          </div>
        </FieldSet>
      ) : null}
    </>
  )
}

/** A group's name, with its Choir when it belongs to one: two Choirs may each have a "Festgrupp". */
function useGroupLabel() {
  const t = useTranslations("Groups.catalogue")
  return (group: LimitGroup) =>
    group.choirName ? t("groupInChoir", { group: group.name, choir: group.choirName }) : group.name
}
