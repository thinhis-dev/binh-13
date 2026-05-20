/**
 * Integration tests for the surrender feature.
 *
 * These tests use a real in-memory SQLite database and a real Socket.io server
 * bound to port 0. No mocks are used for the database or transport.
 */
import type { Card, RoundResult } from '@binh-13/shared'
import type { Socket } from 'socket.io-client'
import { EVENTS } from '@binh-13/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestServer } from '../../__tests__/helpers/createTestServer'
import {
  createSocketClient,
  waitForEvent,
} from '../../__tests__/helpers/socketClient'

interface SessionCreatedPayload { playerId: number, name: string }
interface RoomPayload { code: string }
interface GameDealtPayload { hand: Card[], timerSeconds: number }
interface SurrenderedPayload { surrenderedBy: number, winner: 'p1' | 'p2' }

describe('surrender integration', () => {
  let port = 0
  let closeServer: (() => Promise<void>) | undefined
  const sockets: Socket[] = []

  beforeEach(async () => {
    const server = await createTestServer()
    port = server.port
    closeServer = server.closeServer
  })

  afterEach(async () => {
    for (const s of sockets.splice(0)) s.disconnect()
    await closeServer?.()
  })

  async function connect() {
    const s = createSocketClient(port)
    sockets.push(s)
    await waitForEvent(s, 'connect')
    return s
  }

  async function createSession(s: Socket, name: string): Promise<SessionCreatedPayload> {
    const p = waitForEvent<SessionCreatedPayload>(s, EVENTS.SESSION_CREATED)
    s.emit(EVENTS.SESSION_CREATE, { name })
    return p
  }

  async function setupGameRoom() {
    const s1 = await connect()
    const s2 = await connect()
    const p1 = await createSession(s1, 'Alice')
    const p2 = await createSession(s2, 'Bob')

    const roomCreated = waitForEvent<RoomPayload>(s1, EVENTS.ROOM_CREATED)
    s1.emit(EVENTS.ROOM_CREATE, { playerId: p1.playerId })
    const { code } = await roomCreated

    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    const [d1, d2] = await Promise.all([p1Dealt, p2Dealt])

    return { s1, s2, p1, p2, code, d1, d2 }
  }

  it('full surrender flow: join → game starts → P1 surrenders → both get result', async () => {
    const { s1, s2, p1, code } = await setupGameRoom()

    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const r2 = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)

    const surrendered1 = waitForEvent<SurrenderedPayload>(s1, EVENTS.GAME_SURRENDERED)
    const surrendered2 = waitForEvent<SurrenderedPayload>(s2, EVENTS.GAME_SURRENDERED)

    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })

    const [result1, result2, surr1, surr2] = await Promise.all([r1, r2, surrendered1, surrendered2])

    // Both players receive the same result
    expect(result1.surrendered).toBe(true)
    expect(result1.surrenderedBy).toBe(p1.playerId)
    expect(result1.winner).toBe('p2')
    expect(result1.p1Score).toBe(0)
    expect(result1.p2Score).toBe(3)
    expect(result2).toEqual(result1)

    // Both receive the GAME_SURRENDERED event
    expect(surr1.surrenderedBy).toBe(p1.playerId)
    expect(surr1.winner).toBe('p2')
    expect(surr2).toEqual(surr1)
  })

  it('after surrender, a new room/game can be started independently', async () => {
    const { s1, s2, p1, p2, code } = await setupGameRoom()

    // First game — P1 surrenders
    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const r2 = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)
    s1.on(EVENTS.GAME_SURRENDERED, () => {})
    s2.on(EVENTS.GAME_SURRENDERED, () => {})

    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })
    await Promise.all([r1, r2])

    // Both players start fresh by creating a new room (simulating rematch via new room)
    const roomCreated2 = waitForEvent<RoomPayload>(s1, EVENTS.ROOM_CREATED)
    s1.emit(EVENTS.ROOM_CREATE, { playerId: p1.playerId })
    const { code: code2 } = await roomCreated2

    const p1Dealt2 = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt2 = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code: code2 })
    const [d1, d2] = await Promise.all([p1Dealt2, p2Dealt2])

    // New game started normally
    expect(d1.hand).toHaveLength(13)
    expect(d2.hand).toHaveLength(13)
  })

  it('surrender with authenticated session — no auth errors, result delivered', async () => {
    const { s1, s2, p1, code } = await setupGameRoom()

    // Verify sessions exist (JWT in session manager)
    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    s2.on(EVENTS.GAME_RESULT, () => {})
    s1.on(EVENTS.GAME_SURRENDERED, () => {})
    s2.on(EVENTS.GAME_SURRENDERED, () => {})

    // Should succeed — no error event
    const errPromise = waitForEvent<{ message: string }>(s1, EVENTS.ERROR).then(
      (e) => { throw new Error(`Unexpected error: ${e.message}`) },
    )
    const resultPromise = r1

    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })

    // If result resolves first the test passes; error would throw
    const result = await Promise.race([
      resultPromise,
      errPromise.catch((e) => { throw e }),
    ])
    expect((result as RoundResult).surrendered).toBe(true)
  })
})
