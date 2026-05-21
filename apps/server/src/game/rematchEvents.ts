import type { Server } from 'socket.io'
import { EVENTS } from '@binh-13/shared'
import { z } from 'zod'
import { createChildLogger } from '../lib/logger'
import { getRoom, getRoomSettings } from '../rooms/roomManager'
import { getSession } from '../session/sessionManager'
import { triggerGameStart } from './gameEvents'
import {
  addRematchRequest,
  clearRematch,
  getRematchRequests,
  hasRematchRequest,
  isRematchReady,
} from './rematchManager'

const log = createChildLogger({ module: 'rematchEvents' })

const rematchPayloadSchema = z.object({
  playerId: z.number().int().positive(),
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{6}$/i, 'Room code must be 6 alphanumeric characters')
    .transform(c => c.toUpperCase()),
})

export function registerRematchEvents(io: Server): void {
  io.on('connection', (socket) => {
    socket.on(EVENTS.GAME_REMATCH_REQUEST, (payload) => {
      const parsed = rematchPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        socket.emit(EVENTS.ERROR, {
          message: parsed.error.issues[0]?.message ?? 'Invalid payload',
        })
        return
      }

      const { playerId, code } = parsed.data

      const session = getSession(playerId)
      if (!session) {
        socket.emit(EVENTS.ERROR, { message: 'Session not found' })
        return
      }

      const room = getRoom(code)
      if (!room) {
        socket.emit(EVENTS.ERROR, { message: 'Room not found' })
        return
      }

      if (room.status !== 'finished') {
        socket.emit(EVENTS.ERROR, {
          message: 'Rematch only available after a finished game',
        })
        return
      }

      if (!room.players.some(p => p.playerId === playerId)) {
        socket.emit(EVENTS.ERROR, { message: 'Not in this room' })
        return
      }

      // Idempotent — ignore duplicate requests from the same player
      if (hasRematchRequest(code, playerId)) {
        return
      }

      addRematchRequest(code, playerId)

      // Re-fetch room to get the latest player list (opponent may have left)
      const currentRoom = getRoom(code)
      if (!currentRoom) {
        clearRematch(code)
        socket.emit(EVENTS.ERROR, { message: 'Room no longer exists' })
        return
      }

      const otherPlayer = currentRoom.players.find(
        p => p.playerId !== playerId && p.connected,
      )
      if (!otherPlayer) {
        clearRematch(code)
        socket.emit(EVENTS.ERROR, { message: 'Opponent has left the room' })
        return
      }

      const playerIds: [number, number] = [playerId, otherPlayer.playerId]

      if (isRematchReady(code, playerIds)) {
        clearRematch(code)
        io.to(code).emit(EVENTS.GAME_REMATCH_ACCEPTED, {})
        const settings = getRoomSettings(code)
        triggerGameStart(io, code, currentRoom.players, settings.timerSeconds)
        log.info({ code }, 'Rematch accepted — new game started')
      }
      else {
        io.to(code).emit(EVENTS.GAME_REMATCH_REQUESTED, { requestedBy: playerId })
        log.info({ code, playerId }, 'Rematch requested — waiting for opponent')
      }
    })

    socket.on(EVENTS.GAME_REMATCH_DECLINED, (payload) => {
      const parsed = rematchPayloadSchema.safeParse(payload)
      if (!parsed.success) {
        socket.emit(EVENTS.ERROR, {
          message: parsed.error.issues[0]?.message ?? 'Invalid payload',
        })
        return
      }

      const { playerId, code } = parsed.data

      const session = getSession(playerId)
      if (!session) {
        socket.emit(EVENTS.ERROR, { message: 'Session not found' })
        return
      }

      const room = getRoom(code)
      if (!room) {
        socket.emit(EVENTS.ERROR, { message: 'Room not found' })
        return
      }

      if (room.status !== 'finished') {
        socket.emit(EVENTS.ERROR, {
          message: 'Rematch only available after a finished game',
        })
        return
      }

      clearRematch(code)
      io.to(code).emit(EVENTS.GAME_REMATCH_CANCELLED, {
        declinedBy: playerId,
        reason: 'declined',
      })
      log.info({ code, playerId }, 'Rematch declined')
    })
  })
}

/**
 * Called from roomEvents when a player leaves or disconnects.
 * Clears any pending rematch state and notifies the remaining player.
 */
export function handleRematchOnPlayerExit(
  io: Server,
  roomCode: string,
  playerId: number,
  reason: 'left' | 'disconnected',
): void {
  const requests = getRematchRequests(roomCode)
  if (requests.size > 0) {
    clearRematch(roomCode)
    io.to(roomCode).emit(EVENTS.GAME_REMATCH_CANCELLED, {
      declinedBy: playerId,
      reason,
    })
    log.info({ roomCode, playerId, reason }, 'Rematch cancelled due to player exit')
  }
}
