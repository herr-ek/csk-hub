"use client"

import { useId, useRef, useState } from "react"
import type { PostAddress, PostAudienceTarget } from "@/core/authz/model"
import { useTranslations } from "@/core/i18n/translations"
import { useValidationMessage } from "@/core/i18n/validation-errors"
import { SelectField } from "@/shared/forms/fields"
import { validationMessageIds } from "@/shared/schemas"
import { Button } from "@/shared/ui/base/button"
import { Field, FieldError, FieldLabel } from "@/shared/ui/base/field"
import type { PostComposeOptions } from "../service"

type TargetRow = PostAudienceTarget & { key: number }

export function PostAddressFields({
  initial,
  options,
  identityFixed,
  onChange,
  targetErrors
}: {
  initial: PostAddress
  options: PostComposeOptions
  identityFixed: boolean
  onChange: (address: PostAddress) => void
  targetErrors?: readonly number[]
}) {
  const t = useTranslations("Posts")
  const formatValidation = useValidationMessage()
  const errorPrefix = useId()
  const [address, setAddress] = useState(initial)
  const [audience, setAudience] = useState(initial.audienceAll ? "all" : initial.targets.length ? "targets" : "")
  const [rows, setRows] = useState<TargetRow[]>(() => initial.targets.map((target, key) => ({ ...target, key })))
  const nextKey = useRef(rows.length)
  const change = (next: PostAddress) => {
    setAddress(next)
    onChange(next)
  }
  const changeRows = (next: TargetRow[]) => {
    setRows(next)
    change({ ...address, targets: next.map(({ groupId, voiceFamily }) => ({ groupId, voiceFamily })) })
  }
  const allowed = options.audiencesByPublisher[address.publisherGroupId ?? ""] ?? []
  const visibleGroups = options.groups.filter(
    (g) => allowed.includes(g.id) || initial.targets.some((target) => target.groupId === g.id)
  )
  return (
    <>
      <input type="hidden" name="targets" value={JSON.stringify(address.targets)} />
      {identityFixed ? (
        <Field>
          <FieldLabel>{t("publisherLabel")}</FieldLabel>
          <p className="text-sm">
            {options.groups.find((g) => g.id === address.publisherGroupId)?.name ?? t("personalPublisher")}
          </p>
          <input type="hidden" name="publisherGroupId" value={address.publisherGroupId ?? ""} />
        </Field>
      ) : (
        <SelectField
          label={t("publisherLabel")}
          name="publisherGroupId"
          value={address.publisherGroupId ?? ""}
          options={[
            { value: "", label: t("personalPublisher") },
            ...options.publishers.map((g) => ({ value: g.id, label: g.name }))
          ]}
          onValueChange={(id) => change({ ...address, publisherGroupId: id || null })}
        />
      )}
      <SelectField
        label={t("audienceLabel")}
        name="audience"
        value={audience}
        options={[
          { value: "", label: t("chooseAudience") },
          { value: "all", label: t("allCsk") },
          { value: "targets", label: t("selectedTargets") }
        ]}
        onValueChange={(value) => {
          setAudience(value)
          change({ ...address, audienceAll: value === "all", targets: value === "targets" ? address.targets : [] })
          if (value !== "targets") setRows([])
        }}
      />
      {audience === "targets" ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">{t("audienceTargets")}</legend>
          <p className="text-sm text-muted-foreground">{t("targetsDescription")}</p>
          {rows.map((row, index) => {
            const invalid = Boolean(targetErrors?.includes(index) && row.groupId === null && row.voiceFamily === null)
            const errorId = `${errorPrefix}-${row.key}`
            return (
              <div
                key={row.key}
                role="group"
                aria-describedby={invalid ? errorId : undefined}
                className="flex flex-col gap-2"
              >
                <div className="grid items-end gap-3 sm:grid-cols-[1fr_10rem_auto]">
                  <SelectField
                    label={t("targetGroup", { number: index + 1 })}
                    invalid={invalid}
                    name={`target.${row.key}.groupId`}
                    value={row.groupId ?? ""}
                    options={[
                      { value: "", label: t("allCsk") },
                      ...visibleGroups.map((g) => ({
                        value: g.id,
                        label: g.name + (g.active ? "" : t("archivedSuffix"))
                      }))
                    ]}
                    onValueChange={(id) =>
                      changeRows(rows.map((r) => (r.key === row.key ? { ...r, groupId: id || null } : r)))
                    }
                  />
                  <SelectField
                    label={t("targetVoice")}
                    invalid={invalid}
                    name={`target.${row.key}.voiceFamily`}
                    value={row.voiceFamily ?? ""}
                    options={[
                      { value: "", label: t("anyVoice") },
                      ...(["S", "A", "T", "B"] as const).map((voice) => ({ value: voice, label: voice }))
                    ]}
                    onValueChange={(value) =>
                      changeRows(
                        rows.map((r) =>
                          r.key === row.key
                            ? { ...r, voiceFamily: (value || null) as PostAudienceTarget["voiceFamily"] }
                            : r
                        )
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => changeRows(rows.filter((r) => r.key !== row.key))}
                  >
                    {t("removeTarget", { number: index + 1 })}
                  </Button>
                </div>
                <FieldError id={errorId}>
                  {invalid ? formatValidation({ message: validationMessageIds.audienceTargetIncomplete }) : undefined}
                </FieldError>
              </div>
            )
          })}
          <Button
            type="button"
            variant="outline"
            disabled={rows.length >= 100}
            onClick={() => changeRows([...rows, { key: nextKey.current++, groupId: null, voiceFamily: null }])}
          >
            {t("addTarget")}
          </Button>
        </fieldset>
      ) : null}
    </>
  )
}
