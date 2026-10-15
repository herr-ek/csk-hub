"use client"

import Link from "next/link"
import { useActionState, useEffect } from "react"
import { useFormStatus } from "react-dom"
import { useTranslations } from "@/core/i18n/translations"
import { type RichTextDocument, RichTextEditor } from "@/features/rich-text"
import { InputField } from "@/shared/forms/fields"
import { Alert, AlertAction, AlertDescription } from "@/shared/ui/base/alert"
import { Button, buttonVariants } from "@/shared/ui/base/button"
import { Field, FieldError, FieldGroup, FieldTitle } from "@/shared/ui/base/field"
import { postDocument } from "../post-document"
import type { PostFormState } from "./actions"
import { POST_TITLE_MAX_LENGTH } from "./schemas"
import { useUnsavedPost } from "./use-unsaved-post"

const POST_BODY_LABEL_ID = "post-body-label"

type PostFormProps = {
  action: (state: PostFormState, formData: FormData) => Promise<PostFormState>
  /** A draft can be saved or published; a published Post can only be saved as it is. */
  stage: "draft" | "published"
  /** What the Post says now, when it already exists. */
  initial?: { title: string; body: RichTextDocument }
  /**
   * Where unsaved changes are kept across a reload: the Post's id, or `"new"`, and the
   * version of the Post the form was loaded from.
   */
  unsaved: { slot: string; version: string }
  cancelHref: string
}

const NOTHING_WRITTEN = { title: "", body: undefined }

export function PostForm({ action: submit, stage, initial, unsaved: storage, cancelHref }: PostFormProps) {
  const t = useTranslations("Posts")
  const common = useTranslations("Common")
  const [state, action] = useActionState<PostFormState, FormData>(submit, { status: "idle" })
  const unsaved = useUnsavedPost({ ...storage, initial: initial ?? NOTHING_WRITTEN })
  const { saveFailed } = unsaved

  // Runs once per settled submission: a failure keeps the copy for the next attempt.
  useEffect(() => {
    if (state.status === "error") saveFailed()
  }, [state, saveFailed])

  // React resets the form once the action settles, so a rejected post survives only
  // if the action hands back what was typed. Short of that, the form starts from a
  // copy kept before a reload, and failing that, from the Post as saved.
  const rejected = state.status === "error" ? state.values : undefined
  const startedFrom = unsaved.restored ?? initial
  const title = rejected?.title ?? startedFrom?.title
  const body = rejected ? (postDocument.parse(rejected.body) ?? undefined) : startedFrom?.body
  // A restored copy arrives after the fields have mounted, and the editor only reads its
  // default once, so the fields start over whenever the copy comes or goes.
  const fieldsKey = unsaved.restored ? "restored" : "saved"

  return (
    <form action={action} onSubmit={unsaved.saving} className="flex flex-col gap-6 md:min-h-0 md:flex-1">
      {unsaved.restored && state.status === "idle" ? (
        <Alert>
          <AlertDescription>{t("unsavedRestored")}</AlertDescription>
          <AlertAction>
            <Button type="button" variant="outline" size="sm" onClick={unsaved.discard}>
              {t("discardUnsaved")}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      <FieldGroup className="md:min-h-0">
        <InputField
          key={fieldsKey}
          onChange={(event) => unsaved.changeTitle(event.target.value)}
          label={t("titleLabel")}
          name="title"
          type="text"
          defaultValue={title}
          maxLength={POST_TITLE_MAX_LENGTH}
          required
        />
        <Field className="md:min-h-0">
          <FieldTitle id={POST_BODY_LABEL_ID}>{t("bodyLabel")}</FieldTitle>
          <RichTextEditor
            key={fieldsKey}
            onChange={unsaved.changeBody}
            schema={postDocument}
            name="body"
            defaultValue={body}
            labelledBy={POST_BODY_LABEL_ID}
            placeholder={t("bodyPlaceholder")}
          />
        </Field>
        <FieldError>{state.status === "error" ? t(state.error) : undefined}</FieldError>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButtons stage={stage} />
        <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>
          {common("cancel")}
        </Link>
      </div>
    </form>
  )
}

/**
 * Pressing Enter in the title submits through the first button, so for a draft that is
 * Save draft: publishing only ever happens from the Publish button itself.
 */
function SubmitButtons({ stage }: { stage: PostFormProps["stage"] }) {
  const t = useTranslations("Posts")
  const { pending, data } = useFormStatus()
  const pendingIntent = pending ? data?.get("intent") : undefined

  if (stage === "published") {
    return (
      <Button type="submit" disabled={pending}>
        {pending ? t("savingChanges") : t("saveChanges")}
      </Button>
    )
  }

  return (
    <>
      <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending}>
        {pendingIntent === "draft" ? t("savingDraft") : t("saveDraft")}
      </Button>
      <Button type="submit" name="intent" value="publish" disabled={pending}>
        {pendingIntent === "publish" ? t("publishing") : t("publish")}
      </Button>
    </>
  )
}
