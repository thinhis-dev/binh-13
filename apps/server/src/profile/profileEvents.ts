import type { Server, Socket } from 'socket.io'
import { AVATARS, EVENTS } from '@binh-13/shared'
import { z } from 'zod'
import { requireIdentity } from '../auth/identity'
import { getPlayerStats } from '../game/matchResults'
import { createChildLogger } from '../lib/logger'
import { getPlayer, updatePlayer } from '../session/sessionManager'

const log = createChildLogger({ module: 'profileEvents' })

const profileGetSchema = z.object({
  playerId: z.number().int().positive(),
})

const profileUpdateSchema = z.object({
  playerId: z.number().int().positive(),
  name: z.string().trim().min(1, 'Name is required').max(20, 'Name is too long').optional(),
  avatar: z.enum(AVATARS).optional(),
})

export function registerProfileEvents(io: Server): void {
  io.on('connection', (socket) => {
    socket.on(EVENTS.PROFILE_GET, (payload) => {
      const parsed = profileGetSchema.safeParse(payload)
      if (!parsed.success) {
        emitError(socket, parsed.error.issues[0]?.message ?? 'Invalid payload')
        return
      }

      const { playerId } = parsed.data
      if (!requireIdentity(socket, playerId))
        return

      const player = getPlayer(playerId)
      if (!player) {
        emitError(socket, 'Player not found')
        return
      }

      socket.emit(EVENTS.PROFILE_DATA, {
        playerId: player.playerId,
        name: player.name,
        avatar: player.avatar,
        createdAt: player.createdAt,
        username: player.username,
        stats: getPlayerStats(playerId),
      })
      log.info({ playerId }, 'Profile fetched')
    })

    socket.on(EVENTS.PROFILE_UPDATE, (payload) => {
      const parsed = profileUpdateSchema.safeParse(payload)
      if (!parsed.success) {
        emitError(socket, parsed.error.issues[0]?.message ?? 'Invalid payload')
        return
      }

      const { playerId, name, avatar } = parsed.data
      if (!requireIdentity(socket, playerId))
        return

      const player = getPlayer(playerId)
      if (!player) {
        emitError(socket, 'Player not found')
        return
      }

      updatePlayer(playerId, { name, avatar })
      const updated = getPlayer(playerId)!

      io.to(socket.id).emit(EVENTS.PROFILE_UPDATED, {
        name: updated.name,
        avatar: updated.avatar,
      })
      log.info({ playerId }, 'Profile updated')
    })
  })
}

function emitError(socket: Socket, message: string): void {
  socket.emit(EVENTS.ERROR, { message })
}
