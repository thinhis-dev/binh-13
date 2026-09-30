import type { Room } from '@binh-13/shared'
import type { Socket } from 'socket.io-client'
import { EVENTS } from '@binh-13/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestServer } from '../../__tests__/helpers/createTestServer'
import {
  createSocketClient,
  waitForEvent,
} from '../../__tests__/helpers/socketClient'

interface SessionCreatedPayload {
  playerId: number
  name: string
}

interface RoomPayload {
  code: string
}

interface ErrorPayload {
  message: string
}

interface RoomStatePayload {
  room: Room
}

describe('room ready integration', () => {
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

  async function createSession(socket: Socket, name: string) {
    const created = waitForEvent<SessionCreatedPayload>(socket, EVENTS.SESSION_CREATED)
    socket.emit(EVENTS.SESSION_CREATE, { name })
    return created
  }

  function waitForRoomState(socket: Socket, predicate: (room: Room) => boolean): Promise<Room> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(EVENTS.ROOM_STATE, handle)
        reject(new Error('Timed out waiting for matching room:state'))
      }, 2_000)

      function handle(payload: RoomStatePayload) {
        if (!predicate(payload.room))
          return
        clearTimeout(timer)
        socket.off(EVENTS.ROOM_STATE, handle)
        resolve(payload.room)
      }

      socket.on(EVENTS.ROOM_STATE, handle)
    })
  }

  function recordDealt(socket: Socket): { count: number } {
    const record = { count: 0 }
    socket.on(EVENTS.GAME_DEALT, () => {
      record.count += 1
    })
    return record
  }

  async function setupJoinedRoom() {
    const s1 = await connectClient()
    const s2 = await connectClient()
    const p1 = await createSession(s1, 'Alice')
    const p2 = await createSession(s2, 'Bob')

    const created = waitForEvent<RoomPayload>(s1, EVENTS.ROOM_CREATED)
    s1.emit(EVENTS.ROOM_CREATE, { playerId: p1.playerId })
    const { code } = await created

    const bothJoined = waitForRoomState(s1, room => room.players.length === 2)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    await bothJoined

    return { s1, s2, p1, p2, code }
  }

  it('does not deal when the second player joins without being ready', async () => {
    const { s1, s2 } = await setupJoinedRoom()
    const p1Dealt = recordDealt(s1)
    const p2Dealt = recordDealt(s2)

    await new Promise(resolve => setTimeout(resolve, 150))

    expect(p1Dealt.count).toBe(0)
    expect(p2Dealt.count).toBe(0)
  })

  it('joined players start as not ready in room:state', async () => {
    const s1 = await connectClient()
    const s2 = await connectClient()
    const p1 = await createSession(s1, 'Alice')
    const p2 = await createSession(s2, 'Bob')
    const created = waitForEvent<RoomPayload>(s1, EVENTS.ROOM_CREATED)
    s1.emit(EVENTS.ROOM_CREATE, { playerId: p1.playerId })
    const { code } = await created

    const bothJoined = waitForRoomState(s1, room => room.players.length === 2)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    const room = await bothJoined

    expect(room.players.map(player => player.ready)).toEqual([false, false])
  })

  it('does not deal when only one player is ready', async () => {
    const { s1, s2, p1, code } = await setupJoinedRoom()
    const p1Dealt = recordDealt(s1)
    const p2Dealt = recordDealt(s2)

    const p1Ready = waitForRoomState(s2, room => room.players.some(p => p.id === p1.playerId && p.ready))
    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })
    const room = await p1Ready
    await new Promise(resolve => setTimeout(resolve, 150))

    expect(room.status).toBe('waiting')
    expect(p1Dealt.count).toBe(0)
    expect(p2Dealt.count).toBe(0)
  })

  it('deals to both players once both are ready (autoStart on)', async () => {
    const { s1, s2, p1, p2, code } = await setupJoinedRoom()

    const p1Dealt = waitForEvent<{ hand: string[] }>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<{ hand: string[] }>(s2, EVENTS.GAME_DEALT)
    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })
    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })

    const [d1, d2] = await Promise.all([p1Dealt, p2Dealt])
    expect(d1.hand).toHaveLength(13)
    expect(d2.hand).toHaveLength(13)
  })

  it('does not deal when a player cancels ready before the other readies', async () => {
    const { s1, s2, p1, p2, code } = await setupJoinedRoom()
    const p1Dealt = recordDealt(s1)

    const cancelled = waitForRoomState(s1, room => room.players.every(p => !p.ready))
    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })
    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: false })
    await cancelled

    const p2Ready = waitForRoomState(s1, room => room.players.some(p => p.id === p2.playerId && p.ready))
    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
    await p2Ready
    await new Promise(resolve => setTimeout(resolve, 150))

    expect(p1Dealt.count).toBe(0)
  })

  it('rejects GAME_START until both players are ready (autoStart off)', async () => {
    const { s1, s2, p1, p2, code } = await setupJoinedRoom()

    const settingsUpdated = waitForEvent(s1, EVENTS.ROOM_SETTINGS_UPDATED)
    s1.emit(EVENTS.ROOM_SETTINGS_UPDATE, { playerId: p1.playerId, code, settings: { autoStart: false } })
    await settingsUpdated

    const notReadyError = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.GAME_START, { playerId: p1.playerId, code })
    await expect(notReadyError).resolves.toEqual({ message: 'Both players must be ready to start' })

    const bothReady = waitForRoomState(s1, room => room.players.every(p => p.ready))
    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })
    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
    await bothReady

    const p1Dealt = waitForEvent(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent(s2, EVENTS.GAME_DEALT)
    s1.emit(EVENTS.GAME_START, { playerId: p1.playerId, code })
    await expect(Promise.all([p1Dealt, p2Dealt])).resolves.toBeDefined()
  })

  it('clears a player ready flag when that player leaves', async () => {
    const { s1, s2, p2, code } = await setupJoinedRoom()

    const p2Ready = waitForRoomState(s1, room => room.players.some(p => p.id === p2.playerId && p.ready))
    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
    await p2Ready

    const p2Left = waitForRoomState(s1, room => room.players.some(p => p.id === p2.playerId && !p.connected))
    s2.emit(EVENTS.ROOM_LEAVE, { playerId: p2.playerId, code })
    const room = await p2Left

    expect(room.players.find(p => p.id === p2.playerId)?.ready).toBe(false)
  })

  it('rejects ready from a player who is not in the room', async () => {
    const { code } = await setupJoinedRoom()
    const s3 = await connectClient()
    const p3 = await createSession(s3, 'Carol')

    const error = waitForEvent<ErrorPayload>(s3, EVENTS.ERROR)
    s3.emit(EVENTS.ROOM_READY, { playerId: p3.playerId, code, ready: true })
    await expect(error).resolves.toEqual({ message: 'Player is not in this room' })
  })

  it('rejects an invalid ready payload', async () => {
    const { s1, p1, code } = await setupJoinedRoom()

    const error = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: 'yes' })
    await expect(error).resolves.toBeDefined()
  })
})
