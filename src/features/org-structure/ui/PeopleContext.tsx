"use client"

import { createContext, type ReactNode, useContext } from "react"
import type { IsoDate } from "@/core/org-structure"
import type { Person } from "../roster-reads"

type People = { people: Person[]; today: IsoDate }

const PeopleContext = createContext<People | null>(null)

/** Supplies a screen's dialogs with every active User, sent to the browser once, and the day they were read. */
export function PeopleProvider({ people, today, children }: People & { children: ReactNode }) {
  return <PeopleContext value={{ people, today }}>{children}</PeopleContext>
}

export function usePeople() {
  const people = useContext(PeopleContext)
  if (!people) throw new Error("usePeople needs a PeopleProvider.")
  return people
}
