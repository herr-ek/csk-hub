"use client"

import { useTranslations } from "@/core/i18n/translations"
import { InputField } from "@/shared/forms/fields"
import { Badge } from "@/shared/ui/base/badge"
import { Button } from "@/shared/ui/base/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/base/card"
import { Field, FieldLegend, FieldSet } from "@/shared/ui/base/field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/base/table"
import type { GroupType } from "../../model"
import { CommandDialog } from "../command-dialog"
import { NAME_MAX_LENGTH } from "../limits"
import { createPositionAction, updatePositionAction } from "./actions"
import type { CataloguePosition } from "./query"

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

/** The Positions groups can hold, and the group types each is allowed in. */
export function PositionCatalogue({ positions }: { positions: CataloguePosition[] }) {
  const t = useTranslations("Groups.catalogue")
  const types = useTranslations("Groups.types")

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <CommandDialog
          trigger={
            <Button type="button" variant="outline">
              {t("create")}
            </Button>
          }
          title={t("create")}
          action={createPositionAction}
          submitLabel={t("create")}
        >
          <PositionFields />
        </CommandDialog>
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
                </TableCell>
                <TableCell className="text-right">
                  <CommandDialog
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
                    <PositionFields position={position} />
                  </CommandDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function PositionFields({ position }: { position?: CataloguePosition }) {
  const t = useTranslations("Groups")
  const types = useTranslations("Groups.types")
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
                  className="size-4 accent-primary"
                />
                {types(type)}
              </label>
            </Field>
          ))}
        </div>
      </FieldSet>
    </>
  )
}
