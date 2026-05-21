/** In-memory rematch request state, keyed by room code. */
const rematchState = new Map<string, Set<number>>()

/** Records that the given player has requested a rematch in this room. */
export function addRematchRequest(code: string, playerId: number): void {
  if (!rematchState.has(code)) {
    rematchState.set(code, new Set())
  }
  rematchState.get(code)!.add(playerId)
}

/** Returns true if the given player has an active rematch request in this room. */
export function hasRematchRequest(code: string, playerId: number): boolean {
  return rematchState.get(code)?.has(playerId) ?? false
}

/**
 * Returns true when both players in the given pair have sent rematch requests.
 * Order of playerIds is irrelevant.
 */
export function isRematchReady(code: string, playerIds: [number, number]): boolean {
  const set = rematchState.get(code)
  if (!set)
    return false
  return playerIds.every(id => set.has(id))
}

/** Removes all rematch requests for the given room. */
export function clearRematch(code: string): void {
  rematchState.delete(code)
}

/**
 * Returns the set of player IDs that have requested a rematch in this room.
 * Returns an empty set if no requests exist.
 */
export function getRematchRequests(code: string): Set<number> {
  return new Set(rematchState.get(code) ?? [])
}
