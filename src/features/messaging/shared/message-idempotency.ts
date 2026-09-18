export function createMessageIdempotencyKey() {
  return crypto.randomUUID()
}

export function nextMessageIdempotencyKey(previousKey: string, createKey = createMessageIdempotencyKey) {
  let nextKey = createKey()
  while (nextKey === previousKey) nextKey = createKey()
  return nextKey
}
