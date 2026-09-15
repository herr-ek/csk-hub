import { ViewTransition } from "react"

/**
 * The list and detail routes are a hierarchy: opening a post moves forward,
 * while the explicit return link moves back. Keeping this mapping here makes
 * the two routes participate in the same transition contract.
 */
export function NewsPageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      {children}
    </ViewTransition>
  )
}
