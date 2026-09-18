/** The single active-recipient rule used by direct-message reads and writes. */
export function canReceiveDirectMessages({ exists, banned }: { exists: boolean; banned: boolean }) {
  return exists && !banned
}
