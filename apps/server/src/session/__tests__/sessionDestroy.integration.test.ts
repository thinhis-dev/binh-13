import type { Socket } from 'socket.io-client'
import { EVENTS } from '@binh-13/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestServer } from '../../__tests__/helpers/createTestServer'
import {
  createSocketClient,
  waitForEvent,
} from '../../__tests__/helpers/socketClient'
import { getDb } from '../../db'

interface SessionCreatedPayload { playerId: number, name: string }
interface RoomPayload { code: string }
interface ErrorPayload { message: string }

describe('session:destroy integration', () => {
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

  async function createSession(
    socket: Socket,
    name: string,
  ): Promise<SessionCreatedPayload> {
    const created = waitForEvent<SessionCreatedPayload>(
      socket,
      EVENTS.SESSION_CREATED,
    )
    socket.emit(EVENTS.SESSION_CREATE, { name })
    return created
  }

  it('destroys a session and emits SESSION_DESTROYED', async () => {
    const s1 = await connectClient()
    const { playerId } = await createSession(s1, 'Alice')

    const destroyed = waitForEvent<void>(s1, EVENTS.SESSION_DESTROYED)
    s1.emit(EVENTS.SESSION_DESTROY, { playerId })
    await destroyed

    // Session row should be gone from DB
    const row = getDb()
      .prepare('SELECT * FROM sessions WHERE player_id = ?')
      .get(playerId)
    expect(row).toBeUndefined()
  })

  it('force-leaves room before destroying session', async () => {
    const s1 = await connectClient()
    const s2 = await connectClient()
    const p1 = await createSession(s1, 'Alice')
    const p2 = await createSession(s2, 'Bob')

    // Alice creates room
    const roomCreated = waitForEvent<RoomPayload>(s1, EVENTS.ROOM_CREATED)
    s1.emit(EVENTS.ROOM_CREATE, { playerId: p1.playerId })
    const { code } = await roomCreated

    // Bob joins room
    const roomJoined = waitForEvent<RoomPayload>(s2, EVENTS.ROOM_JOINED)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    await roomJoined

    // Alice destroys session — Bob should see ROOM_LEFT
    const roomLeft = waitForEvent<{ playerId: number }>(s2, EVENTS.ROOM_LEFT)
    const destroyed = waitForEvent<void>(s1, EVENTS.SESSION_DESTROYED)
    s1.emit(EVENTS.SESSION_DESTROY, { playerId: p1.playerId })

    const [leftPayload] = await Promise.all([roomLeft, destroyed])
    expect(leftPayload.playerId).toBe(p1.playerId)

    // Alice session gone from DB
    const session = getDb()
      .prepare('SELECT * FROM sessions WHERE player_id = ?')
      .get(p1.playerId)
    expect(session).toBeUndefined()

    // Bob still exists
    const bobSession = getDb()
      .prepare('SELECT * FROM sessions WHERE player_id = ?')
      .get(p2.playerId)
    expect(bobSession).toBeDefined()
  })

  it('disconnects the socket after destroying session', async () => {
    const s1 = await connectClient()
    const { playerId } = await createSession(s1, 'Alice')

    const disconnected = waitForEvent<void>(s1, 'disconnect')
    s1.emit(EVENTS.SESSION_DESTROY, { playerId })
    await disconnected

    expect(s1.connected).toBe(false)
  })

  it('is idempotent when the session row is already gone for the authenticated player', async () => {
    const s1 = await connectClient()
    const { playerId } = await createSession(s1, 'Alice')

    // Simulate a stale session (e.g. server restart wiped the DB) while this
    // socket's in-memory identity binding is still intact.
    getDb().prepare('DELETE FROM sessions WHERE player_id = ?').run(playerId)

    const destroyed = waitForEvent<void>(s1, EVENTS.SESSION_DESTROYED)
    const disconnected = waitForEvent<void>(s1, 'disconnect')
    s1.emit(EVENTS.SESSION_DESTROY, { playerId })
    await destroyed
    await disconnected

    expect(s1.connected).toBe(false)
  })

  it('rejects SESSION_DESTROY for a playerId other than the one this socket authenticated as', async () => {
    const s1 = await connectClient()
    await createSession(s1, 'Alice')

    const errorEvent = waitForEvent<{ message: string }>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.SESSION_DESTROY, { playerId: 99999 })
    await expect(errorEvent).resolves.toMatchObject({ message: expect.any(String) })
    expect(s1.connected).toBe(true)
  })
})
