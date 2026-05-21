import type { Server, Socket } from 'socket.io'
import { EVENTS } from '@binh-13/shared'
import { z } from 'zod'
import { triggerGameStart } from '../game/gameEvents'
import { endGame } from '../game/gameManager'
import { handleRematchOnPlayerExit } from '../game/rematchEvents'
import { createChildLogger } from '../lib/logger'
import {
  createSession,
  deleteSession,
  getSession,
  getSessionBySocketId,
  updateSocketId,
} from '../session/sessionManager'
import {
  clearRoom,
  createRoom,
  getRoom,
  getRoomByPlayer,
  getRoomSettings,
  joinRoom,
  leaveRoom,
  toPublicRoom,
  updateRoomSettings,
} from './roomManager'

const roomCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{6}$/i, 'Room code must be 6 alphanumeric characters')
  .transform(code => code.toUpperCase())

const sessionCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(20, 'Name is too long'),
})

const playerSchema = z.object({
  playerId: z.number().int().positive(),
})

const roomActionSchema = playerSchema.extend({
  code: roomCodeSchema,
})

const roomMessageSchema = roomActionSchema.extend({
  text: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(200, 'Message is too long'),
})

const roomSettingsSchema = roomActionSchema.extend({
  settings: z.object({
    timerSeconds: z.number().int().min(0).max(600).optional(),
    autoStart: z.boolean().optional(),
    allowFoul: z.boolean().optional(),
    showHandStrength: z.boolean().optional(),
    revealOnSubmit: z.boolean().optional(),
  }),
})

type EventPayload<T extends z.ZodTypeAny> = z.infer<T>

export function registerRoomEvents(io: Server): void {
  io.on('connection', (socket) => {
    const log = createChildLogger({ socketId: socket.id })
    log.info('Client connected')

    socket.on(EVENTS.SESSION_CREATE, (payload) => {
      log.debug({ event: EVENTS.SESSION_CREATE }, 'Socket event received')
      const data = parsePayload(socket, sessionCreateSchema, payload)
      if (!data)
        return

      const playerId = createSession(data.name, socket.id)
      socket.emit(EVENTS.SESSION_CREATED, { playerId, name: data.name })
      log.info({ playerId, event: EVENTS.SESSION_CREATE }, 'Session created')
    })

    socket.on(EVENTS.SESSION_DESTROY, (payload) => {
      log.debug({ event: EVENTS.SESSION_DESTROY }, 'Socket event received')
      const data = parsePayload(socket, playerSchema, payload)
      if (!data)
        return

      // Idempotent: if session already gone (e.g. server restart wiped DB),
      // still confirm destruction so the client can clear local state.
      if (getSession(data.playerId)) {
        // Force-leave room if player is in one
        const room = getRoomByPlayer(data.playerId)
        if (room) {
          leaveRoom(room.code, data.playerId)
          socket.leave(room.code)
          io.to(room.code).emit(EVENTS.ROOM_LEFT, { playerId: data.playerId })
          const updatedRoom = getRoom(room.code)
          if (updatedRoom)
            emitRoomState(io, room.code)
        }

        deleteSession(data.playerId)
      }

      socket.emit(EVENTS.SESSION_DESTROYED)
      socket.disconnect(true)
      log.info({ playerId: data.playerId }, 'Session destroyed')
    })

    socket.on(EVENTS.ROOM_CREATE, (payload) => {
      log.debug({ event: EVENTS.ROOM_CREATE }, 'Socket event received')
      const data = parsePayload(socket, playerSchema, payload)
      if (!data || !assertSession(socket, data.playerId))
        return

      updateSocketId(data.playerId, socket.id)
      const code = createRoom(data.playerId)
      socket.join(code)

      socket.emit(EVENTS.ROOM_CREATED, { code })
      emitRoomState(io, code)
      log.info({ playerId: data.playerId, roomCode: code }, 'Room created')
    })

    socket.on(EVENTS.ROOM_JOIN, (payload) => {
      log.debug({ event: EVENTS.ROOM_JOIN }, 'Socket event received')
      const data = parsePayload(socket, roomActionSchema, payload)
      if (!data || !assertSession(socket, data.playerId))
        return

      updateSocketId(data.playerId, socket.id)
      const joined = joinRoom(data.code, data.playerId)
      if (!joined) {
        log.warn(
          { playerId: data.playerId, roomCode: data.code },
          'Room join rejected',
        )
        emitError(socket, 'Room not found or already full')
        return
      }

      socket.join(data.code)
      socket.emit(EVENTS.ROOM_JOINED, { code: data.code })
      emitRoomState(io, data.code)
      log.info({ playerId: data.playerId, roomCode: data.code }, 'Room joined')

      // Trigger game start when 2nd player joins (if autoStart enabled)
      const updatedRoom = getRoom(data.code)
      if (updatedRoom && updatedRoom.players.length === 2) {
        const settings = getRoomSettings(data.code)
        if (settings.autoStart) {
          triggerGameStart(io, data.code, updatedRoom.players, settings.timerSeconds)
          log.info({ roomCode: data.code }, 'Game start triggered (autoStart)')
        }
        else {
          log.info({ roomCode: data.code }, 'autoStart disabled — waiting for GAME_START')
        }
      }
    })

    socket.on(EVENTS.ROOM_LEAVE, (payload) => {
      log.debug({ event: EVENTS.ROOM_LEAVE }, 'Socket event received')
      const data = parsePayload(socket, roomActionSchema, payload)
      if (!data || !assertSession(socket, data.playerId))
        return

      const room = getRoom(data.code)
      if (!room || !isPlayerInRoom(room, data.playerId)) {
        log.warn(
          { playerId: data.playerId, roomCode: data.code },
          'Room leave rejected',
        )
        emitError(socket, 'Player is not in this room')
        return
      }

      // Cancel any pending rematch before leaving
      handleRematchOnPlayerExit(io, data.code, data.playerId, 'left')

      leaveRoom(data.code, data.playerId)
      socket.leave(data.code)
      io.to(data.code).emit(EVENTS.ROOM_LEFT, { playerId: data.playerId })

      const updatedRoom = getRoom(data.code)
      if (updatedRoom) {
        emitRoomState(io, data.code)
      }
      else {
        endGame(data.code)
      }
      log.info({ playerId: data.playerId, roomCode: data.code }, 'Room left')
    })

    socket.on(EVENTS.ROOM_MESSAGE, (payload) => {
      log.debug({ event: EVENTS.ROOM_MESSAGE }, 'Socket event received')
      const data = parsePayload(socket, roomMessageSchema, payload)
      if (!data || !assertSession(socket, data.playerId))
        return

      const room = getRoom(data.code)
      const player = room?.players.find(
        candidate => candidate.playerId === data.playerId,
      )
      if (!room || !player) {
        log.warn(
          { playerId: data.playerId, roomCode: data.code },
          'Room message rejected',
        )
        emitError(socket, 'Player is not in this room')
        return
      }

      io.to(data.code).emit(EVENTS.ROOM_MESSAGE, {
        playerId: data.playerId,
        name: player.name,
        text: data.text,
        at: Date.now(),
      })
      log.info(
        { playerId: data.playerId, roomCode: data.code },
        'Room message broadcast',
      )
    })

    socket.on(EVENTS.ROOM_CLEAR, (payload) => {
      log.debug({ event: EVENTS.ROOM_CLEAR }, 'Socket event received')
      const data = parsePayload(socket, roomActionSchema, payload)
      if (!data || !assertSession(socket, data.playerId))
        return

      const room = getRoom(data.code)
      if (!room) {
        log.warn(
          { playerId: data.playerId, roomCode: data.code },
          'Room clear rejected: missing room',
        )
        emitError(socket, 'Room not found')
        return
      }

      if (room.createdBy !== data.playerId) {
        log.warn(
          { playerId: data.playerId, roomCode: data.code },
          'Room clear rejected: non-creator',
        )
        emitError(socket, 'Only the room creator can clear this room')
        return
      }

      io.to(data.code).emit(EVENTS.ROOM_CLEARED, { code: data.code })
      endGame(data.code)
      clearRoom(data.code)
      leaveSocketRoom(io, data.code)
      log.info({ playerId: data.playerId, roomCode: data.code }, 'Room cleared')
    })

    socket.on(EVENTS.GAME_START, (payload) => {
      log.debug({ event: EVENTS.GAME_START }, 'Socket event received')
      const data = parsePayload(socket, roomActionSchema, payload)
      if (!data || !assertSession(socket, data.playerId))
        return

      const room = getRoom(data.code)
      if (!room) {
        log.warn(
          { playerId: data.playerId, roomCode: data.code },
          'Game start rejected: missing room',
        )
        emitError(socket, 'Room not found')
        return
      }

      if (room.createdBy !== data.playerId) {
        log.warn(
          { playerId: data.playerId, roomCode: data.code },
          'Game start rejected: non-creator',
        )
        emitError(socket, 'Only the room creator can start the game')
        return
      }

      if (room.players.length < 2) {
        log.warn(
          { playerId: data.playerId, roomCode: data.code },
          'Game start rejected: not enough players',
        )
        emitError(socket, 'Need 2 players to start')
        return
      }

      if (room.status !== 'waiting') {
        log.warn(
          { playerId: data.playerId, roomCode: data.code },
          'Game start rejected: game already in progress',
        )
        emitError(socket, 'Game already in progress')
        return
      }

      const settings = getRoomSettings(data.code)
      triggerGameStart(io, data.code, room.players, settings.timerSeconds)
      log.info({ playerId: data.playerId, roomCode: data.code }, 'Game start triggered manually')
    })

    socket.on(EVENTS.ROOM_SETTINGS_UPDATE, (payload) => {
      log.debug({ event: EVENTS.ROOM_SETTINGS_UPDATE }, 'Socket event received')
      const data = parsePayload(socket, roomSettingsSchema, payload)
      if (!data || !assertSession(socket, data.playerId))
        return

      const room = getRoom(data.code)
      if (!room) {
        log.warn(
          { playerId: data.playerId, roomCode: data.code },
          'Settings update rejected: missing room',
        )
        emitError(socket, 'Room not found')
        return
      }

      if (room.createdBy !== data.playerId) {
        log.warn(
          { playerId: data.playerId, roomCode: data.code },
          'Settings update rejected: non-creator',
        )
        emitError(socket, 'Only the room creator can change settings')
        return
      }

      if (room.status !== 'waiting') {
        log.warn(
          { playerId: data.playerId, roomCode: data.code },
          'Settings update rejected: game in progress',
        )
        emitError(socket, 'Cannot change settings while game is in progress')
        return
      }

      const updatedSettings = updateRoomSettings(data.code, data.settings)

      io.to(data.code).emit(EVENTS.ROOM_SETTINGS_UPDATED, {
        settings: updatedSettings,
      })
      emitRoomState(io, data.code)
      log.info(
        { playerId: data.playerId, roomCode: data.code },
        'Room settings updated',
      )
    })

    socket.on('disconnect', () => {
      log.info('Client disconnected')
      handleDisconnect(io, socket)
    })
  })
}

function parsePayload<T extends z.ZodTypeAny>(
  socket: Socket,
  schema: T,
  payload: unknown,
): EventPayload<T> | undefined {
  const result = schema.safeParse(payload)
  if (result.success)
    return result.data

  createChildLogger({ socketId: socket.id }).warn(
    { issues: result.error.issues },
    'Socket payload rejected',
  )
  emitError(socket, result.error.issues[0]?.message ?? 'Invalid payload')
  return undefined
}

function assertSession(socket: Socket, playerId: number): boolean {
  if (getSession(playerId))
    return true

  createChildLogger({ socketId: socket.id }).warn(
    { playerId },
    'Session lookup rejected',
  )
  emitError(socket, 'Session not found')
  return false
}

function emitRoomState(io: Server, code: string): void {
  const room = getRoom(code)
  if (!room)
    return

  io.to(code).emit(EVENTS.ROOM_STATE, { room: toPublicRoom(room) })
}

function emitError(socket: Socket, message: string): void {
  socket.emit(EVENTS.ERROR, { message })
}

function isPlayerInRoom(
  room: NonNullable<ReturnType<typeof getRoom>>,
  playerId: number,
): boolean {
  return room.players.some(player => player.playerId === playerId)
}

function leaveSocketRoom(io: Server, code: string): void {
  const room = io.sockets.adapter.rooms.get(code)
  if (!room)
    return

  for (const socketId of room) {
    io.sockets.sockets.get(socketId)?.leave(code)
  }
}

function handleDisconnect(io: Server, socket: Socket): void {
  const session = getSessionBySocketId(socket.id)
  if (!session)
    return

  const room = getRoomByPlayer(session.playerId)
  if (!room)
    return

  // Cancel any pending rematch before the player is removed
  handleRematchOnPlayerExit(io, room.code, session.playerId, 'disconnected')

  leaveRoom(room.code, session.playerId)
  io.to(room.code).emit(EVENTS.ROOM_LEFT, { playerId: session.playerId })

  // If room was cleared (all players disconnected), cancel any active game timer
  if (!getRoom(room.code)) {
    endGame(room.code)
  }
  else {
    emitRoomState(io, room.code)
  }
}
