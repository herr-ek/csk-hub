"use client"

import { useId, useState } from "react"
import { useTranslations } from "@/core/i18n/translations"
import { Badge } from "@/shared/ui/base/badge"
import { Field, FieldLabel } from "@/shared/ui/base/field"
import { Input } from "@/shared/ui/base/input"
import type { Person } from "../roster-reads"

type PickerProps = {
  label: string
  people: Person[]
  /** Submitted once per picked person. */
  name: string
  onPick?: (userIds: string[]) => void
  multiple?: boolean
}

/** A searchable list of people; the picked ones are submitted with the form and one is required. */
export function PersonPicker({ label, people, name, onPick, multiple = false }: PickerProps) {
  const t = useTranslations("OrgAdmin.picker")
  const id = useId()
  const [search, setSearch] = useState("")
  const [picked, setPicked] = useState<string[]>([])
  const matches = people.filter((person) => person.name.toLowerCase().includes(search.trim().toLowerCase()))
  const chosen = people.filter((person) => picked.includes(person.id))

  const toggle = (userId: string) => {
    const next = !multiple
      ? [userId]
      : picked.includes(userId)
        ? picked.filter((other) => other !== userId)
        : [...picked, userId]
    setPicked(next)
    onPick?.(next)
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="search"
        value={search}
        placeholder={t("search")}
        autoComplete="off"
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault()
        }}
      />
      <ul className="flex max-h-56 flex-col overflow-y-auto overscroll-contain rounded-2xl border p-1">
        {matches.map((person) => (
          <li key={person.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-muted has-checked:bg-muted has-focus-visible:ring-2 has-focus-visible:ring-ring">
              <input
                type={multiple ? "checkbox" : "radio"}
                name={`${id}-choice`}
                checked={picked.includes(person.id)}
                onChange={() => toggle(person.id)}
                className="accent-primary"
              />
              <span className="min-w-0 flex-1 truncate">{person.name}</span>
              <PersonDetail person={person} />
            </label>
          </li>
        ))}
        {matches.length === 0 ? <li className="px-3 py-2 text-sm text-muted-foreground">{t("none")}</li> : null}
      </ul>
      {multiple && chosen.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {chosen.map((person) => (
            <Badge key={person.id} variant="secondary">
              {person.name}
            </Badge>
          ))}
        </div>
      ) : null}
      {picked.map((userId) => (
        <input key={userId} type="hidden" name={name} value={userId} />
      ))}
      {/* Holds the browser's required check, which a list of choices filtered by a search cannot. */}
      <input
        value={picked.join(",")}
        required
        onChange={() => {}}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />
    </Field>
  )
}

/** Where someone sings, or the Choirs they belong to without a Section. */
export function PersonDetail({ person }: { person: Person }) {
  const places = person.placements.map(({ sectionName, voice }) =>
    sectionName.endsWith(voice) ? sectionName : `${sectionName} · ${voice}`
  )
  const detail = places.length > 0 ? places : person.choirs.map(({ name }) => name)
  return <span className="shrink-0 text-xs text-muted-foreground">{detail.join(", ")}</span>
}
