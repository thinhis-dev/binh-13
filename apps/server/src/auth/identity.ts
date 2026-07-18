import type { Socket } from 'socket.io'
import { EVENTS } from '@binh-13/shared'

export interface SocketData {
  playerId?: number
}

/** Binds the authenticated playerId to this socket after SESSION_CREATE/RESTORE. */
export function bindSocketIdentity(socket: Socket, playerId: number): void {
  (socket.data as SocketData).playerId = playerId
}

export function getSocketIdentity(socket: Socket): number | undefined {
  return (socket.data as SocketData).playerId
}

/**
 * Verifies that `claimedId` matches the identity this socket authenticated
 * as via SESSION_CREATE/SESSION_RESTORE. Emits ERROR and returns false
 * otherwise — never trust a payload's playerId on its own.
 */
export function requireIdentity(socket: Socket, claimedId: number): boolean {
  const boundId = getSocketIdentity(socket)

  if (boundId === undefined) {
    socket.emit(EVENTS.ERROR, { message: 'Not authenticated' })
    return false
  }

  if (boundId !== claimedId) {
    socket.emit(EVENTS.ERROR, { message: 'Player identity mismatch' })
    return false
  }

  return true
}
