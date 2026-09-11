"use client"

import Link from "next/link"
import { useActionState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { ROUTES } from "@/core/navigation/site"
import { Button, buttonVariants } from "@/shared/ui/base/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import { Textarea } from "@/shared/ui/base/textarea"
import { type PublishPostState, publishPost } from "./actions"
import { POST_TITLE_MAX_LENGTH } from "./schemas"

/**
 * The form for publishing a post. It is used in the `PublishPostScreen`
 */
export function PublishPostForm() {
  const t = useTranslations("Posts")
  const common = useTranslations("Common")
  const [state, action, pending] = useActionState<PublishPostState, FormData>(publishPost, { status: "idle" })
  // React resets the form once the action settles, so a rejected post survives only
  // if the action hands back what was typed.
  const draft = state.status === "error" ? state.draft : undefined

  return (
    <form action={action} className="space-y-6">
      <FieldGroup>
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
        <Field>
          <FieldLabel htmlFor="post-body">{t("bodyLabel")}</FieldLabel>
          <Textarea id="post-body" name="body" rows={12} defaultValue={draft?.body} className="min-h-56" required />
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
