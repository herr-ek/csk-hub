import { Monitor, Moon, Sun } from "lucide-react"

export const themes = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor }
] as const

export type Theme = (typeof themes)[number]["value"]

export function isTheme(value: unknown): value is Theme {
  return themes.some((theme) => theme.value === value)
}
