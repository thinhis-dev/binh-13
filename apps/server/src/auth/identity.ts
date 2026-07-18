import type { Socket } from 'socket.io'

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
