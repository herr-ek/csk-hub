"use client"

import { PencilIcon } from "lucide-react"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import { useId, useRef, useState } from "react"
import type { PostAddress, PostAudienceTarget } from "@/core/authz/model"
import { useTranslations } from "@/core/i18n/translations"
import { useValidationMessage } from "@/core/i18n/validation-errors"
import { SelectField } from "@/shared/forms/fields"
import { validationMessageIds } from "@/shared/schemas"
import { Button, buttonVariants } from "@/shared/ui/base/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/shared/ui/base/dialog"
import { Field, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/shared/ui/base/field"
import { RadioGroup, RadioGroupItem } from "@/shared/ui/base/radio-group"
import { cn } from "@/shared/utils"
import { PostAudience } from "../PostAudience"
import type { PostComposeOptions } from "../service"

type TargetRow = PostAudienceTarget & { key: number }

type AddressOptions = {
  options: PostComposeOptions
  identityFixed: boolean
  targetErrors?: readonly number[]
  audienceInvalid?: boolean
}

const SUMMARY_TARGETS = 3
// The navbar's spring, so the editor moves like the rest of the app.
const spring = { type: "spring", bounce: 0.15, visualDuration: 0.25 } as const
const blurIn = {
  initial: { opacity: 0, filter: "blur(8px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(8px)" },
  transition: spring
}

const isIncomplete = (target: PostAudienceTarget | undefined) =>
  target !== undefined && target.groupId === null && target.voiceFamily === null

/**
 * A draft's publisher can stop being one the Member may represent. Keep it visible so the
 * Member sees the Group, and say it must change before the Post can be saved.
 */
function lostPublisher(publisherGroupId: string | null, { options, identityFixed }: AddressOptions) {
  if (identityFixed || publisherGroupId === null || options.publishers.some((g) => g.id === publisherGroupId))
    return undefined
  return { id: publisherGroupId, name: options.groups.find((g) => g.id === publisherGroupId)?.name ?? "" }
}

/**
 * Who a Post is from and to, as a summary that opens a dialog to change them. The dialog edits
 * a copy that applies on Done. Its fields render outside the form, so the form submits the
 * applied address through the hidden inputs here.
 */
export function PostAddressFields({
  initial,
  onChange,
  ...props
}: AddressOptions & {
  initial: PostAddress
  onChange: (address: PostAddress) => void
}) {
  const { options, targetErrors, audienceInvalid } = props
  const t = useTranslations("Posts")
  const common = useTranslations("Common")
  const formatValidation = useValidationMessage()
  const errorId = useId()
  const [address, setAddress] = useState(initial)
  const [open, setOpen] = useState(false)
  const lost = lostPublisher(address.publisherGroupId, props)
  const error = lost
    ? t("publisherNoLongerAvailable", { name: lost.name })
    : targetErrors?.some((index) => isIncomplete(address.targets[index]))
      ? formatValidation({ message: validationMessageIds.audienceTargetIncomplete })
      : audienceInvalid && !address.audienceAll && address.targets.length === 0
        ? formatValidation({ message: validationMessageIds.audienceRequired })
        : undefined
  const targets = address.targets
    .filter((target) => !isIncomplete(target))
    .map(({ groupId, voiceFamily }) => ({
      groupName: groupId === null ? null : (options.groups.find((g) => g.id === groupId)?.name ?? ""),
      voiceFamily
    }))
  return (
    <MotionConfig reducedMotion="user">
      <Field data-invalid={Boolean(error)}>
        <input type="hidden" name="publisherGroupId" value={address.publisherGroupId ?? ""} />
        <input type="hidden" name="audience" value={address.audienceAll ? "all" : ""} />
        <input type="hidden" name="targets" value={JSON.stringify(address.targets)} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            type="button"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "h-auto w-full items-start justify-between gap-4 rounded-2xl p-4 text-left font-normal whitespace-normal"
            )}
          >
            {/* Blurs the new summary in as the dialog closes on Done. */}
            <AnimatePresence initial={false} mode="wait">
              <motion.span
                key={JSON.stringify(address)}
                {...blurIn}
                className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2"
              >
                <span className="text-muted-foreground">{t("publisherLabel")}</span>
                <span className="font-medium">
                  {options.groups.find((g) => g.id === address.publisherGroupId)?.name ?? t("personalPublisher")}
                </span>
                <span className="text-muted-foreground">{t("audienceLabel")}</span>
                {address.audienceAll || targets.length ? (
                  <span className="flex flex-wrap items-center gap-1.5">
                    <PostAudience audienceAll={address.audienceAll} targets={targets.slice(0, SUMMARY_TARGETS)} />
                    {targets.length > SUMMARY_TARGETS ? (
                      <span className="text-muted-foreground">
                        {t("moreTargets", { count: targets.length - SUMMARY_TARGETS })}
                      </span>
                    ) : null}
                  </span>
                ) : (
                  <span className="font-medium">{t("chooseAudience")}</span>
                )}
              </motion.span>
            </AnimatePresence>
            <span className="flex items-center gap-1.5 font-medium">
              <PencilIcon aria-hidden="true" />
              {common("edit")}
            </span>
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
            <AddressEditor
              {...props}
              initial={address}
              onDone={(next) => {
                setAddress(next)
                onChange(next)
                setOpen(false)
              }}
            />
          </DialogContent>
        </Dialog>
        <FieldError id={errorId}>{error}</FieldError>
      </Field>
    </MotionConfig>
  )
}

/** Mounts each time the dialog opens, so Cancel leaves nothing behind. */
function AddressEditor({
  initial,
  onDone,
  ...props
}: AddressOptions & { initial: PostAddress; onDone: (address: PostAddress) => void }) {
  const { options, identityFixed, targetErrors, audienceInvalid } = props
  const t = useTranslations("Posts")
  const common = useTranslations("Common")
  const formatValidation = useValidationMessage()
  const id = useId()
  const [publisherGroupId, setPublisherGroupId] = useState(initial.publisherGroupId)
  const [audience, setAudience] = useState(initial.audienceAll ? "all" : initial.targets.length ? "targets" : "")
  const [rows, setRows] = useState<TargetRow[]>(() => initial.targets.map((target, key) => ({ ...target, key })))
  const nextKey = useRef(rows.length)
  const changeRow = (key: number, change: Partial<PostAudienceTarget>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...change } : r)))
  const allowed = options.audiencesByPublisher[publisherGroupId ?? ""] ?? []
  const selectableGroups = options.groups.filter((g) => allowed.includes(g.id))
  const lost = lostPublisher(publisherGroupId, props)
  const audienceMissing = Boolean(audienceInvalid) && audience === ""
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("addressTitle")}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-6">
        {identityFixed ? (
          <Field>
            <FieldLabel>{t("publisherLabel")}</FieldLabel>
            <p className="text-sm">
              {options.groups.find((g) => g.id === publisherGroupId)?.name ?? t("personalPublisher")}
            </p>
          </Field>
        ) : (
          <SelectField
            label={t("publisherLabel")}
            name="publisherGroupId"
            value={publisherGroupId ?? ""}
            invalid={Boolean(lost)}
            error={lost ? t("publisherNoLongerAvailable", { name: lost.name }) : undefined}
            options={[
              { value: "", label: t("personalPublisher") },
              ...options.publishers.map((g) => ({ value: g.id, label: g.name })),
              ...(lost ? [{ value: lost.id, label: lost.name }] : [])
            ]}
            onValueChange={(next) => {
              // Targets the new publisher may not address would fail on save; drop them now.
              const usable = options.audiencesByPublisher[next] ?? []
              setRows(rows.filter((row) => row.groupId === null || usable.includes(row.groupId)))
              setPublisherGroupId(next || null)
            }}
          />
        )}
        <FieldSet data-invalid={audienceMissing}>
          <FieldLegend variant="label">{t("audienceLabel")}</FieldLegend>
          <RadioGroup value={audience} onValueChange={(next) => setAudience(String(next))}>
            {(["all", "targets"] as const).map((value) => (
              <Field key={value} orientation="horizontal" data-invalid={audienceMissing}>
                <RadioGroupItem id={`${id}-${value}`} value={value} aria-invalid={audienceMissing || undefined} />
                <FieldLabel htmlFor={`${id}-${value}`} className="font-normal">
                  {t(value === "all" ? "allCsk" : "selectedTargets")}
                </FieldLabel>
              </Field>
            ))}
          </RadioGroup>
          <FieldError>
            {audienceMissing ? formatValidation({ message: validationMessageIds.audienceRequired }) : undefined}
          </FieldError>
        </FieldSet>
        <AnimatePresence initial={false}>
          {audience === "targets" ? (
            <motion.fieldset key="targets" {...blurIn} className="relative flex flex-col gap-3">
              <legend className="mb-2 text-sm font-medium">{t("audienceTargets")}</legend>
              <p className="text-sm text-muted-foreground">{t("targetsDescription")}</p>
              <AnimatePresence initial={false} mode="popLayout">
                {rows.map((row, index) => {
                  const unavailable =
                    row.groupId && !allowed.includes(row.groupId)
                      ? options.groups.find((group) => group.id === row.groupId)
                      : undefined
                  const invalid = Boolean(targetErrors?.includes(index) && isIncomplete(row))
                  const errorId = `${id}-target-${row.key}`
                  return (
                    <motion.div
                      key={row.key}
                      layout
                      {...blurIn}
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
                            ...selectableGroups.map((g) => ({ value: g.id, label: g.name })),
                            ...(unavailable
                              ? [
                                  {
                                    value: unavailable.id,
                                    label: t(unavailable.active ? "targetNoLongerAvailable" : "archivedGroup", {
                                      name: unavailable.name
                                    }),
                                    disabled: true
                                  }
                                ]
                              : [])
                          ]}
                          onValueChange={(groupId) => changeRow(row.key, { groupId: groupId || null })}
                        />
                        <SelectField
                          label={t("targetVoice")}
                          invalid={invalid}
                          name={`target.${row.key}.voiceFamily`}
                          value={row.voiceFamily ?? ""}
                          disabled={Boolean(unavailable)}
                          options={[
                            { value: "", label: t("anyVoice") },
                            ...(["S", "A", "T", "B"] as const).map((voice) => ({ value: voice, label: voice }))
                          ]}
                          onValueChange={(voice) =>
                            changeRow(row.key, { voiceFamily: (voice || null) as PostAudienceTarget["voiceFamily"] })
                          }
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
                        >
                          {t("removeTarget", { number: index + 1 })}
                        </Button>
                      </div>
                      <FieldError id={errorId}>
                        {invalid
                          ? formatValidation({ message: validationMessageIds.audienceTargetIncomplete })
                          : undefined}
                      </FieldError>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
              <motion.div layout transition={spring}>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={rows.length >= 100}
                  onClick={() => setRows([...rows, { key: nextKey.current++, groupId: null, voiceFamily: null }])}
                >
                  {t("addTarget")}
                </Button>
              </motion.div>
            </motion.fieldset>
          ) : null}
        </AnimatePresence>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{common("cancel")}</DialogClose>
        <Button
          type="button"
          onClick={() =>
            onDone({
              publisherGroupId,
              audienceAll: audience === "all",
              targets: audience === "targets" ? rows.map(({ groupId, voiceFamily }) => ({ groupId, voiceFamily })) : []
            })
          }
        >
          {t("addressDone")}
        </Button>
      </DialogFooter>
    </>
  )
}
