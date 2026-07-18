import type { Server, Socket } from 'socket.io'
import { EVENTS } from '@binh-13/shared'
import { z } from 'zod'
import { createChildLogger } from '../lib/logger'
import { getPlayer } from '../session/sessionManager'
import { getPlayerByUsername, hasUsername, isUsernameTaken, setCredentials } from './credentials'
import { bindSocketIdentity, requireIdentity } from './identity'
import { hashPassword, verifyPassword } from './password'
import { isRateLimited, recordFailure, resetAttempts } from './rateLimit'
import { signPlayerToken } from './token'

const log = createChildLogger({ module: 'authEvents' })

const INVALID_CREDENTIALS_MESSAGE = 'Invalid username or password'

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, 'Username must be 3-20 characters: lowercase letters, numbers, underscore')

const authRegisterSchema = z.object({
  playerId: z.number().int().positive(),
  username: usernameSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

const authLoginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
})

export function registerAuthEvents(io: Server): void {
  io.on('connection', (socket) => {
    socket.on(EVENTS.AUTH_REGISTER, (payload) => {
      const parsed = authRegisterSchema.safeParse(payload)
      if (!parsed.success) {
        emitError(socket, parsed.error.issues[0]?.message ?? 'Invalid payload')
        return
      }

      const { playerId, username, password } = parsed.data
      if (!requireIdentity(socket, playerId))
        return

      if (!getPlayer(playerId)) {
        emitError(socket, 'Player not found')
        return
      }

      if (hasUsername(playerId)) {
        emitError(socket, 'This account already has a username')
        return
      }

      if (isUsernameTaken(username)) {
        emitError(socket, 'Username is already taken')
        return
      }

      try {
        setCredentials(playerId, username, hashPassword(password))
      }
      catch {
        // Unique-index race: someone else claimed the same username between
        // our check and this write.
        emitError(socket, 'Username is already taken')
        return
      }

      socket.emit(EVENTS.AUTH_REGISTERED, { username })
      log.info({ playerId }, 'Account claimed')
    })

    socket.on(EVENTS.AUTH_LOGIN, (payload) => {
      const parsed = authLoginSchema.safeParse(payload)
      if (!parsed.success) {
        emitError(socket, parsed.error.issues[0]?.message ?? 'Invalid payload')
        return
      }

      const { username, password } = parsed.data
      const rateLimitKey = `${socket.handshake.address}:${username}`

      if (isRateLimited(rateLimitKey)) {
        emitError(socket, 'Too many attempts. Try again later.')
        return
      }

      const credentialed = getPlayerByUsername(username)
      if (!credentialed || !verifyPassword(password, credentialed.passwordHash)) {
        recordFailure(rateLimitKey)
        emitError(socket, INVALID_CREDENTIALS_MESSAGE)
        return
      }

      resetAttempts(rateLimitKey)
      bindSocketIdentity(socket, credentialed.playerId)
      const token = signPlayerToken(credentialed.playerId)

      socket.emit(EVENTS.AUTH_LOGGED_IN, {
        playerId: credentialed.playerId,
        name: credentialed.name,
        avatar: credentialed.avatar,
        token,
      })
      log.info({ playerId: credentialed.playerId }, 'Logged in')
    })
  })
}

function emitError(socket: Socket, message: string): void {
  socket.emit(EVENTS.ERROR, { message })
}
