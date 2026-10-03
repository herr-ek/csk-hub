"use client"

import Link from "next/link"
import { useActionState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { ROUTES } from "@/core/navigation/site"
import { RichTextEditor } from "@/features/rich-text"
import { Button, buttonVariants } from "@/shared/ui/base/button"
import { Field, FieldError, FieldGroup, FieldLabel, FieldTitle } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { postDocument } from "../post-document"
import { type PublishPostState, publishPost } from "./actions"
import { POST_TITLE_MAX_LENGTH } from "./schemas"

const POST_BODY_LABEL_ID = "post-body-label"

export function PublishPostForm() {
  const t = useTranslations("Posts")
  const common = useTranslations("Common")
  const [state, action, pending] = useActionState<PublishPostState, FormData>(publishPost, { status: "idle" })
  // React resets the form once the action settles, so a rejected post survives only
  // if the action hands back what was typed.
  const draft = state.status === "error" ? state.draft : undefined

  return (
    <form action={action} className="flex flex-col gap-6 md:min-h-0 md:flex-1">
      <FieldGroup className="md:min-h-0">
        <Field>
          <FieldLabel htmlFor="post-title">{t("titleLabel")}</FieldLabel>
          <Input
            id="post-title"
            name="title"
            type="text"
            defaultValue={draft?.title}
            maxLength={POST_TITLE_MAX_LENGTH}
            required
          />
        </Field>
        <Field className="md:min-h-0">
          <FieldTitle id={POST_BODY_LABEL_ID}>{t("bodyLabel")}</FieldTitle>
          <RichTextEditor
            schema={postDocument}
            name="body"
            defaultValue={draft ? (postDocument.parse(draft.body) ?? undefined) : undefined}
            labelledBy={POST_BODY_LABEL_ID}
            placeholder={t("bodyPlaceholder")}
          />
        </Field>
        <FieldError>{state.status === "error" ? t(state.error) : undefined}</FieldError>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("publishing") : t("publish")}
        </Button>
        <Link href={ROUTES.news} className={buttonVariants({ variant: "ghost" })}>
          {common("cancel")}
        </Link>
      </div>
    </form>
  )
}
