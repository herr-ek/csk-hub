import { isStreamCursor } from "./events"

function compare(left: string, right: string) {
  const [leftTime, leftCount] = left.split("-").map(BigInt)
  const [rightTime, rightCount] = right.split("-").map(BigInt)
  return leftTime < rightTime
    ? -1
    : leftTime > rightTime
      ? 1
      : leftCount < rightCount
        ? -1
        : leftCount > rightCount
          ? 1
          : 0
}

/** Initial, invalid, future or trimmed cursors require a state refresh; retained cursors resume through replay alone. */
export function resolveActivityCursor(requested: string | null, first: string, last: string) {
  if (!isStreamCursor(requested) || compare(requested, last) > 0) return { cursor: last, reset: true }
  return { cursor: requested, reset: compare(requested, first) < 0 }
}
