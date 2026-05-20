/**
 * Unit tests for the surrender feature (server-side logic).
 * These tests exercise handleSurrender() via a real Socket.io test server.
 *
 * All tests follow TDD — written before implementation.
 */
import type { Card, PlayerArrangement, RoundResult } from '@binh-13/shared'
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
interface ErrorPayload { message: string }
interface SurrenderedPayload { surrenderedBy: number, winner: 'p1' | 'p2' }

describe('surrender — validation', () => {
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

  async function createSession(s: Socket, name: string) {
    const p = waitForEvent<SessionCreatedPayload>(s, EVENTS.SESSION_CREATED)
    s.emit(EVENTS.SESSION_CREATE, { name })
    return p
  }

  it('rejects surrender with missing code', async () => {
    const s = await connect()
    const p = await createSession(s, 'Alice')
    const err = waitForEvent<ErrorPayload>(s, EVENTS.ERROR)
    s.emit(EVENTS.GAME_SURRENDER, { playerId: p.playerId })
    const { message } = await err
    expect(message).toBeTruthy()
  })

  it('rejects surrender with missing playerId', async () => {
    const s = await connect()
    await createSession(s, 'Alice')
    const err = waitForEvent<ErrorPayload>(s, EVENTS.ERROR)
    s.emit(EVENTS.GAME_SURRENDER, { code: 'ABCDEF' })
    const { message } = await err
    expect(message).toBeTruthy()
  })

  it('rejects surrender when no active game exists for the room', async () => {
    const s = await connect()
    const p = await createSession(s, 'Alice')

    // Create a room but don't start a game
    const roomCreated = waitForEvent<RoomPayload>(s, EVENTS.ROOM_CREATED)
    s.emit(EVENTS.ROOM_CREATE, { playerId: p.playerId })
    const { code } = await roomCreated

    const err = waitForEvent<ErrorPayload>(s, EVENTS.ERROR)
    s.emit(EVENTS.GAME_SURRENDER, { playerId: p.playerId, code })
    const { message } = await err
    expect(message).toMatch(/no active game/i)
  })

  it('rejects surrender when player is not in the game', async () => {
    const s1 = await connect()
    const s2 = await connect()
    const s3 = await connect()
    const p1 = await createSession(s1, 'Alice')
    const p2 = await createSession(s2, 'Bob')
    const p3 = await createSession(s3, 'Charlie')

    const roomCreated = waitForEvent<RoomPayload>(s1, EVENTS.ROOM_CREATED)
    s1.emit(EVENTS.ROOM_CREATE, { playerId: p1.playerId })
    const { code } = await roomCreated

    // Start game with p1+p2
    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    await Promise.all([p1Dealt, p2Dealt])

    // p3 tries to surrender in a game they're not in
    const err = waitForEvent<ErrorPayload>(s3, EVENTS.ERROR)
    s3.emit(EVENTS.GAME_SURRENDER, { playerId: p3.playerId, code })
    const { message } = await err
    expect(message).toMatch(/not in (this|the) (room|game)/i)
  })
})

describe('surrender — core logic', () => {
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

  async function createSession(s: Socket, name: string) {
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

  it('p1 surrender → GAME_RESULT has winner: p2, p2Score: 3, p1Score: 0', async () => {
    const { s1, s2, p1, code } = await setupGameRoom()

    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const r2 = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)

    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })

    const [result1, result2] = await Promise.all([r1, r2])
    expect(result1.winner).toBe('p2')
    expect(result1.p1Score).toBe(0)
    expect(result1.p2Score).toBe(3)
    expect(result2).toEqual(result1)
  })

  it('p2 surrender → GAME_RESULT has winner: p1, p1Score: 3, p2Score: 0', async () => {
    const { s1, s2, p2, code } = await setupGameRoom()

    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const r2 = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)

    s2.emit(EVENTS.GAME_SURRENDER, { playerId: p2.playerId, code })

    const [result1, result2] = await Promise.all([r1, r2])
    expect(result1.winner).toBe('p1')
    expect(result1.p1Score).toBe(3)
    expect(result1.p2Score).toBe(0)
    expect(result2).toEqual(result1)
  })

  it('result includes surrendered: true', async () => {
    const { s1, s2, p1, code } = await setupGameRoom()

    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    s2.on(EVENTS.GAME_RESULT, () => {})

    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })

    const result = await r1
    expect(result.surrendered).toBe(true)
  })

  it('result includes surrenderedBy matching the surrendering player', async () => {
    const { s1, s2, p1, code } = await setupGameRoom()

    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    s2.on(EVENTS.GAME_RESULT, () => {}) // consume

    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })

    const result = await r1
    expect(result.surrenderedBy).toBe(p1.playerId)
  })

  it('gAME_SURRENDERED event is emitted to both players before GAME_RESULT', async () => {
    const { s1, s2, p1, code } = await setupGameRoom()

    const surrendered1 = waitForEvent<SurrenderedPayload>(s1, EVENTS.GAME_SURRENDERED)
    const surrendered2 = waitForEvent<SurrenderedPayload>(s2, EVENTS.GAME_SURRENDERED)

    // consume GAME_RESULT
    s1.on(EVENTS.GAME_RESULT, () => {})
    s2.on(EVENTS.GAME_RESULT, () => {})

    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })

    const [ev1, ev2] = await Promise.all([surrendered1, surrendered2])
    expect(ev1.surrenderedBy).toBe(p1.playerId)
    expect(ev1.winner).toBe('p2')
    expect(ev2).toEqual(ev1)
  })

  it('forfeit arrangement is used for surrenderer when they had no submission', async () => {
    const { s1, s2, p1, code } = await setupGameRoom()

    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    s2.on(EVENTS.GAME_RESULT, () => {})

    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })

    const result = await r1
    expect(result.arrangements.p1).toBeDefined()
    expect(result.arrangements.p1.group1).toHaveLength(5)
    expect(result.arrangements.p1.group2).toHaveLength(5)
    expect(result.arrangements.p1.group3).toHaveLength(3)
  })

  it('opponent arrangement is preserved when opponent already submitted', async () => {
    const { s1, s2, p1, p2, code, d2 } = await setupGameRoom()

    // Build a valid arrangement for p2
    const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
    const sorted = [...d2.hand].sort(
      (a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank),
    )
    const p2Arr: PlayerArrangement = {
      playerId: p2.playerId,
      group1: sorted.slice(0, 5) as PlayerArrangement['group1'],
      group2: sorted.slice(5, 10) as PlayerArrangement['group2'],
      group3: sorted.slice(10, 13) as PlayerArrangement['group3'],
    }

    // P2 submits first
    s2.emit(EVENTS.GAME_SUBMIT, {
      playerId: p2.playerId,
      code,
      arrangement: p2Arr,
    })
    await waitForEvent(s1, EVENTS.GAME_OPPONENT_SUBMITTED)

    // Now P1 surrenders
    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    s2.on(EVENTS.GAME_RESULT, () => {})

    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })

    const result = await r1
    // P2's arrangement should match what they submitted
    expect(result.arrangements.p2.group1.map(c => c.id)).toEqual(
      p2Arr.group1.map(c => c.id),
    )
  })
})

describe('surrender — edge cases', () => {
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

  async function createSession(s: Socket, name: string) {
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

  it('cannot surrender after already submitted', async () => {
    const { s1, s2, p1, code, d1 } = await setupGameRoom()

    const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
    const sorted = [...d1.hand].sort(
      (a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank),
    )
    const p1Arr: PlayerArrangement = {
      playerId: p1.playerId,
      group1: sorted.slice(0, 5) as PlayerArrangement['group1'],
      group2: sorted.slice(5, 10) as PlayerArrangement['group2'],
      group3: sorted.slice(10, 13) as PlayerArrangement['group3'],
    }

    // P1 submits
    s1.emit(EVENTS.GAME_SUBMIT, {
      playerId: p1.playerId,
      code,
      arrangement: p1Arr,
    })
    await waitForEvent(s2, EVENTS.GAME_OPPONENT_SUBMITTED)

    // P1 now tries to surrender — should be rejected
    const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })
    const { message } = await err
    expect(message).toMatch(/cannot surrender after submitting/i)
  })

  it('cannot surrender twice — second attempt returns error (game gone)', async () => {
    const { s1, s2, p1, code } = await setupGameRoom()

    // First surrender — consume result events
    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const r2 = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)
    s1.on(EVENTS.GAME_SURRENDERED, () => {})
    s2.on(EVENTS.GAME_SURRENDERED, () => {})

    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })
    await Promise.all([r1, r2])

    // Second surrender — game is gone
    const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })
    const { message } = await err
    expect(message).toMatch(/no active game/i)
  })

  it('timer handle is cleared after surrender (no more timer events)', async () => {
    const { s1, s2, p1, code } = await setupGameRoom()

    // Collect any timer events after surrender
    const timerEvents: unknown[] = []
    s1.on(EVENTS.GAME_TIMER, data => timerEvents.push(data))

    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    s2.on(EVENTS.GAME_RESULT, () => {})
    s1.on(EVENTS.GAME_SURRENDERED, () => {})
    s2.on(EVENTS.GAME_SURRENDERED, () => {})

    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })
    await r1

    // Wait a bit and verify no timer events arrive after surrender
    const beforeCount = timerEvents.length
    await new Promise(resolve => setTimeout(resolve, 1500))
    expect(timerEvents.length).toBe(beforeCount)
  })

  it('rejects surrender when game exists but is not in arranging status', async () => {
    const { s1, s2, p1, p2, code, d1, d2 } = await setupGameRoom()

    const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']

    // Both players submit to move game to comparing/finished status
    const sorted1 = [...d1.hand].sort(
      (a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank),
    )
    const sorted2 = [...d2.hand].sort(
      (a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank),
    )

    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const r2 = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)

    s1.emit(EVENTS.GAME_SUBMIT, {
      playerId: p1.playerId,
      code,
      arrangement: {
        group1: sorted1.slice(0, 5),
        group2: sorted1.slice(5, 10),
        group3: sorted1.slice(10, 13),
      },
    })
    s2.emit(EVENTS.GAME_SUBMIT, {
      playerId: p2.playerId,
      code,
      arrangement: {
        group1: sorted2.slice(0, 5),
        group2: sorted2.slice(5, 10),
        group3: sorted2.slice(10, 13),
      },
    })

    await Promise.all([r1, r2])

    // Game is now finished — try to surrender
    const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })
    const { message } = await err
    expect(message).toMatch(/no active game/i)
  })
})
