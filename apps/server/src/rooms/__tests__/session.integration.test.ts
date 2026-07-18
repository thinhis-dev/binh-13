import type { Socket } from 'socket.io-client'
import { EVENTS } from '@binh-13/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestServer } from '../../__tests__/helpers/createTestServer'
import {
  createSocketClient,
  waitForEvent,
} from '../../__tests__/helpers/socketClient'
import { getDb } from '../../db'

interface SessionCreatedPayload { playerId: number, name: string, token: string }
interface SessionRestoredPayload { playerId: number, name: string, avatar: string }

describe('session integration', () => {
  let port = 0
  let closeServer: (() => Promise<void>) | undefined
  const sockets: Socket[] = []

  beforeEach(async () => {
    const server = await createTestServer()
    port = server.port
    closeServer = server.closeServer
  })

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.disconnect()
    }
    await closeServer?.()
  })

  async function connectClient(): Promise<Socket> {
    const socket = createSocketClient(port)
    sockets.push(socket)
    await waitForEvent(socket, 'connect')
    return socket
  }

  async function createSession(socket: Socket, name: string): Promise<SessionCreatedPayload> {
    const created = waitForEvent<SessionCreatedPayload>(socket, EVENTS.SESSION_CREATED)
    socket.emit(EVENTS.SESSION_CREATE, { name })
    return created
  }

  it('SESSION_CREATE replies with a token and persists players + sessions rows (AC-A1-1)', async () => {
    const socket = await connectClient()
    const created = await createSession(socket, 'Alice')

    expect(created.playerId).toBeGreaterThan(0)
    expect(created.name).toBe('Alice')
    expect(typeof created.token).toBe('string')
    expect(created.token.length).toBeGreaterThan(0)

    const playerRow = getDb().prepare('SELECT * FROM players WHERE id = ?').get(created.playerId)
    expect(playerRow).toBeDefined()

    const sessionRow = getDb().prepare('SELECT * FROM sessions WHERE player_id = ?').get(created.playerId)
    expect(sessionRow).toBeDefined()
  })

  it('restores the same playerId/name across a disconnect using the stored token (AC-A1-2)', async () => {
    const s1 = await connectClient()
    const created = await createSession(s1, 'Bob')
    s1.disconnect()

    const s2 = await connectClient()
    const restored = waitForEvent<SessionRestoredPayload>(s2, EVENTS.SESSION_RESTORED)
    s2.emit(EVENTS.SESSION_RESTORE, { token: created.token })

    await expect(restored).resolves.toMatchObject({
      playerId: created.playerId,
      name: 'Bob',
    })
  })

  it('replies SESSION_RESTORE_FAILED for a garbage token (AC-A1-3)', async () => {
    const socket = await connectClient()
    const failed = waitForEvent<void>(socket, EVENTS.SESSION_RESTORE_FAILED)
    socket.emit(EVENTS.SESSION_RESTORE, { token: 'not-a-real-token' })
    await failed
  })

  it('SESSION_DESTROY keeps the players row and a later SESSION_RESTORE with the same token still works (AC-A1-4)', async () => {
    const s1 = await connectClient()
    const created = await createSession(s1, 'Carol')

    const destroyed = waitForEvent<void>(s1, EVENTS.SESSION_DESTROYED)
    s1.emit(EVENTS.SESSION_DESTROY, { playerId: created.playerId })
    await destroyed

    const playerRow = getDb().prepare('SELECT * FROM players WHERE id = ?').get(created.playerId)
    expect(playerRow).toBeDefined()
    const sessionRow = getDb().prepare('SELECT * FROM sessions WHERE player_id = ?').get(created.playerId)
    expect(sessionRow).toBeUndefined()

    const s2 = await connectClient()
    const restored = waitForEvent<SessionRestoredPayload>(s2, EVENTS.SESSION_RESTORED)
    s2.emit(EVENTS.SESSION_RESTORE, { token: created.token })
    await expect(restored).resolves.toMatchObject({
      playerId: created.playerId,
      name: 'Carol',
    })
  })
})
