"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Button } from "@/shared/ui/base/button"
import { Input } from "@/shared/ui/base/input"
import { MAX_GROUP_NAME_LENGTH } from "../../model/group-conversation"
import type { MessageCommandState } from "../composer/message-command-state"
import { MemberSelection } from "../member-selection"
import { groupConversationAction } from "./group-actions"

type Member = { id: string; name: string }
const initialState: MessageCommandState = { status: "idle" }
const operationLabels = {
  create: "createGroup",
  add: "addMembers",
  rename: "renameGroup"
} as const

export function GroupCommandForm({
  operation,
  conversationId,
  name,
  members = []
}: {
  operation: keyof typeof operationLabels
  conversationId?: string
  name?: string
  members?: Member[]
}) {
  const t = useTranslations("Messages")
  const common = useTranslations("Common")
  const router = useRouter()
  const nameInput = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(name ?? "")
  const [selected, setSelected] = useState<Member[]>([])
  const [state, action, pending] = useActionState(groupConversationAction, initialState)
  const selectsMembers = operation === "create" || operation === "add"
  const namesGroup = operation === "create"
  const canRename = editing && draftName.trim().length > 0 && draftName.trim() !== (name ?? "").trim()
  useEffect(() => {
    if (state.status !== "success") return
    if (operation === "create") router.push(`/messages/${state.conversationId}`)
    setSelected([])
    setEditing(false)
    setDraftName(name ?? "")
  }, [state, operation, router, name])
  useEffect(() => {
    if (editing) nameInput.current?.focus()
  }, [editing])
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="operation" value={operation} />
      <input type="hidden" name="conversationId" value={conversationId ?? ""} />
      {namesGroup ? (
        <Input
          key={name}
          name="name"
          aria-label={t("groupName")}
          placeholder={t("groupName")}
          defaultValue={state.status === "error" ? state.text : name}
          required
          maxLength={MAX_GROUP_NAME_LENGTH}
          disabled={pending}
        />
      ) : null}
      {operation === "rename" ? (
        <div className="grid gap-2">
          <label htmlFor={`group-name-${conversationId}`} className="text-sm font-medium">
            {t("groupName")}
          </label>
          <div className="flex items-center gap-2">
            <Input
              ref={nameInput}
              id={`group-name-${conversationId}`}
              name="name"
              value={editing ? draftName : (name ?? "")}
              onChange={(event) => setDraftName(event.target.value)}
              required
              maxLength={MAX_GROUP_NAME_LENGTH}
              disabled={!editing || pending}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={pending}
              onClick={() => {
                setDraftName(name ?? "")
                setEditing((current) => !current)
              }}
            >
              {editing ? common("cancel") : common("edit")}
            </Button>
          </div>
        </div>
      ) : null}
      {selectsMembers ? (
        <MemberSelection
          value={selected}
          onChange={setSelected}
          disabled={pending}
          excludedIds={members.map((member) => member.id)}
        />
      ) : null}
      {state.status === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {t(state.error === "unexpected" ? "groupUpdateFailed" : `errors.${state.error}`)}
        </p>
      ) : null}
      {state.status === "success" && operation !== "create" ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("groupUpdated")}
        </p>
      ) : null}
      {operation !== "rename" || editing ? (
        <Button
          type="submit"
          className="w-fit max-w-full justify-self-start whitespace-normal"
          variant="default"
          disabled={pending || (selectsMembers && selected.length === 0) || (operation === "rename" && !canRename)}
        >
          {pending ? t("savingGroup") : t(operationLabels[operation])}
        </Button>
      ) : null}
    </form>
  )
}
