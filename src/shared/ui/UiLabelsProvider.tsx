"use client"

import { createContext, type ReactNode, useContext } from "react"

export type UiLabels = {
  close: string
  closeToast: string
  sidebarTitle: string
  mobileSidebarDescription: string
  pickDate: string
  clearDate: string
  time: string
}

const englishLabels: UiLabels = {
  close: "Close",
  closeToast: "Close toast",
  sidebarTitle: "Sidebar",
  mobileSidebarDescription: "Displays the mobile sidebar.",
  pickDate: "Pick a date",
  clearDate: "Clear",
  time: "Time"
}

const UiLabelsContext = createContext<UiLabels>(englishLabels)
const UiLocaleContext = createContext("en")

/**
 * Supplies plain, already-localized labels for built-in UI controls, and the locale they format
 * dates in. Controls rendered without a provider use English.
 */
export function UiLabelsProvider({
  labels,
  locale,
  children
}: {
  labels: UiLabels
  locale: string
  children: ReactNode
}) {
  return (
    <UiLabelsContext.Provider value={labels}>
      <UiLocaleContext.Provider value={locale}>{children}</UiLocaleContext.Provider>
    </UiLabelsContext.Provider>
  )
}

export function useUiLabels() {
  return useContext(UiLabelsContext)
}

/** The BCP 47 locale built-in controls format dates in. */
export function useUiLocale() {
  return useContext(UiLocaleContext)
}
