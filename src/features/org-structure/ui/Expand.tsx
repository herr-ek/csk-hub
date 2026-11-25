import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"

/** The look of a `CollapsibleTrigger` ; pair it with `ExpandChevron`. */
export const EXPAND_TRIGGER =
  "group/expand flex items-center gap-1 self-start text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"

/** Down while collapsed, up while expanded, inside an `EXPAND_TRIGGER`. */
export function ExpandChevron() {
  return (
    <>
      <ChevronDownIcon className="size-3.5 shrink-0 group-aria-expanded/expand:hidden" aria-hidden="true" />
      <ChevronUpIcon className="hidden size-3.5 shrink-0 group-aria-expanded/expand:inline" aria-hidden="true" />
    </>
  )
}
