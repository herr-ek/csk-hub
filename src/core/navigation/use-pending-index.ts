import { useState } from "react"

/**
 * The link just chosen, held while its page loads so the bar's highlight doesn't fall back to the old page in the
 * meantime. It lapses as soon as the path changes, so coming Back to the old page later doesn't bring it back.
 */
export function usePendingIndex(pathname: string | null) {
  const [pending, setPending] = useState<{ index: number; from: string | null } | null>(null)
  if (pending && pending.from !== pathname) setPending(null)
  const pendingIndex = pending?.from === pathname ? pending.index : null
  return [pendingIndex, (index: number) => setPending({ index, from: pathname })] as const
}
