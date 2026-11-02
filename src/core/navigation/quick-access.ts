/**
 * Which of `count` equal-width slots sits under a pointer `offset` pixels from the start of a row `width` pixels wide.
 * Positions past either end resolve to the nearest slot, so a drag that overshoots still lands on the edge.
 */
export function slotIndexAt(offset: number, width: number, count: number) {
  if (count <= 0 || width <= 0) return 0
  return Math.min(Math.max(Math.floor((offset / width) * count), 0), count - 1)
}
