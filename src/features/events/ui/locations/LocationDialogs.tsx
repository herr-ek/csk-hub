"use client"

import { useTranslations } from "@/core/i18n/translations"
import { InputField } from "@/shared/forms/fields"
import { Button } from "@/shared/ui/base/button"
import { EventCommandDialog } from "../EventCommandDialog"
import { SHORT_TEXT_MAX_LENGTH, URL_MAX_LENGTH } from "../limits"
import { archiveLocationAction, createLocationAction, updateLocationAction } from "./actions"
import type { LocationRow } from "./query"

function LocationFields({ location }: { location?: LocationRow }) {
  const t = useTranslations("Events.locations")
  return (
    <>
      <InputField
        label={t("name")}
        name="name"
        defaultValue={location?.name}
        maxLength={SHORT_TEXT_MAX_LENGTH}
        required
      />
      <InputField
        label={t("address")}
        name="address"
        defaultValue={location?.address ?? ""}
        maxLength={SHORT_TEXT_MAX_LENGTH}
      />
      <InputField
        label={t("mapUrl")}
        description={t("mapUrlDescription")}
        name="mapUrl"
        type="url"
        defaultValue={location?.mapUrl ?? ""}
        maxLength={URL_MAX_LENGTH}
      />
    </>
  )
}

export function CreateLocationDialog() {
  const t = useTranslations("Events.locations")
  return (
    <EventCommandDialog
      trigger={<Button type="button">{t("create")}</Button>}
      title={t("create")}
      action={createLocationAction}
      submitLabel={t("create")}
      successMessage={t("saved")}
    >
      <LocationFields />
    </EventCommandDialog>
  )
}

export function EditLocationDialog({ location }: { location: LocationRow }) {
  const t = useTranslations("Events.locations")
  return (
    <EventCommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          {t("edit")}
        </Button>
      }
      title={t("editTitle", { name: location.name })}
      description={location.eventCount > 0 ? t("editAffectsEvents", { count: location.eventCount }) : undefined}
      action={updateLocationAction}
      submitLabel={t("save")}
      successMessage={t("saved")}
    >
      <input type="hidden" name="locationId" value={location.id} />
      <LocationFields location={location} />
    </EventCommandDialog>
  )
}

export function ArchiveLocationDialog({ location }: { location: LocationRow }) {
  const t = useTranslations("Events.locations")
  return (
    <EventCommandDialog
      trigger={
        <Button type="button" variant="ghost" size="sm">
          {t("archive")}
        </Button>
      }
      title={t("archiveTitle", { name: location.name })}
      description={t("archiveExplanation")}
      action={archiveLocationAction}
      submitLabel={t("archive")}
      successMessage={t("archived")}
      destructive
    >
      <input type="hidden" name="locationId" value={location.id} />
    </EventCommandDialog>
  )
}
