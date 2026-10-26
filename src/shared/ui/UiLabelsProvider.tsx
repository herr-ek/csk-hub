"use client"

import { createContext, type ReactNode, useContext } from "react"

export type UiLabels = {
  close: string
  closeToast: string
  sidebarTitle: string
  mobileSidebarDescription: string
}

const englishLabels: UiLabels = {
  close: "Close",
  closeToast: "Close toast",
  sidebarTitle: "Sidebar",
  mobileSidebarDescription: "Displays the mobile sidebar."
}

const UiLabelsContext = createContext<UiLabels>(englishLabels)

/**
 * Supplies plain, already-localized labels for built-in UI controls.
 * Controls rendered without a provider use English defaults.
 */
export function UiLabelsProvider({ labels, children }: { labels: UiLabels; children: ReactNode }) {
  return <UiLabelsContext.Provider value={labels}>{children}</UiLabelsContext.Provider>
}

export function useUiLabels() {
  return useContext(UiLabelsContext)
}
