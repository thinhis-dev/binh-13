/**
 * Unit-level tests for rematch event handlers.
 * Uses a real in-memory SQLite database and a real Socket.io server.
 * Each test sets up a finished game and then exercises rematch logic.
 */
import type { Card, PlayerArrangement, RoundResult } from '@binh-13/shared'
import type { Socket } from 'socket.io-client'
import { EVENTS } from '@binh-13/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestServer } from '../../__tests__/helpers/createTestServer'
import { createSocketClient, waitForEvent } from '../../__tests__/helpers/socketClient'

interface SessionPayload { playerId: number, name: string }
interface RoomPayload { code: string }
interface GameDealtPayload { hand: Card[], timerSeconds: number }
interface ErrorPayload { message: string }
interface RematchRequestedPayload { requestedBy: number }
interface RematchCancelledPayload { declinedBy: number, reason: string }

const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']

function validArrangement(playerId: number, hand: Card[]): PlayerArrangement {
  const sorted = [...hand].sort(
    (a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank),
  )
  return {
    playerId,
    group1: sorted.slice(0, 5) as PlayerArrangement['group1'],
    group2: sorted.slice(5, 10) as PlayerArrangement['group2'],
    group3: sorted.slice(10, 13) as PlayerArrangement['group3'],
  }
}

describe('rematch events', () => {
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

  async function connect(): Promise<Socket> {
    const s = createSocketClient(port)
    sockets.push(s)
    await waitForEvent(s, 'connect')
    return s
  }

  async function createSession(s: Socket, name: string): Promise<SessionPayload> {
    const p = waitForEvent<SessionPayload>(s, EVENTS.SESSION_CREATED)
    s.emit(EVENTS.SESSION_CREATE, { name })
    return p
  }

  /** Sets up two players in a finished game state. */
  async function setupFinishedGame() {
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

    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const r2 = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)
    s1.emit(EVENTS.GAME_SUBMIT, {
      playerId: p1.playerId,
      code,
      arrangement: validArrangement(p1.playerId, d1.hand),
    })
    s2.emit(EVENTS.GAME_SUBMIT, {
      playerId: p2.playerId,
      code,
      arrangement: validArrangement(p2.playerId, d2.hand),
    })
    await Promise.all([r1, r2])

    return { s1, s2, p1, p2, code }
  }

  it('request rematch with invalid payload → emits ERROR', async () => {
    const s1 = await connect()
    const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: 'notanumber', code: 'ROOM01' })
    await expect(err).resolves.toMatchObject({ message: expect.any(String) })
  })

  it('request rematch when room is not finished → emits ERROR', async () => {
    const s1 = await connect()
    const s2 = await connect()
    const p1 = await createSession(s1, 'Alice')
    const p2 = await createSession(s2, 'Bob')

    const roomCreated = waitForEvent<RoomPayload>(s1, EVENTS.ROOM_CREATED)
    s1.emit(EVENTS.ROOM_CREATE, { playerId: p1.playerId })
    const { code } = await roomCreated

    // Trigger game start (autoStart) — room is now 'arranging', not 'finished'
    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    await Promise.all([p1Dealt, p2Dealt])

    const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await expect(err).resolves.toMatchObject({
      message: 'Rematch only available after a finished game',
    })
  })

  it('request rematch when player is not in the room → emits ERROR', async () => {
    const { s1: _s1, p1: _p1, code } = await setupFinishedGame()
    const outsider = await connect()
    const outsiderSession = await createSession(outsider, 'Outsider')

    const err = waitForEvent<ErrorPayload>(outsider, EVENTS.ERROR)
    outsider.emit(EVENTS.GAME_REMATCH_REQUEST, {
      playerId: outsiderSession.playerId,
      code,
    })
    await expect(err).resolves.toMatchObject({ message: 'Not in this room' })
  })

  it('valid request from P1 → emits GAME_REMATCH_REQUESTED to room', async () => {
    const { s1, s2, p1, code } = await setupFinishedGame()

    const requested1 = waitForEvent<RematchRequestedPayload>(s1, EVENTS.GAME_REMATCH_REQUESTED)
    const requested2 = waitForEvent<RematchRequestedPayload>(s2, EVENTS.GAME_REMATCH_REQUESTED)

    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })

    const [r1, r2] = await Promise.all([requested1, requested2])
    expect(r1.requestedBy).toBe(p1.playerId)
    expect(r2.requestedBy).toBe(p1.playerId)
  })

  it('duplicate request from same player is a no-op — no second GAME_REMATCH_REQUESTED', async () => {
    const { s1, s2, p1, code } = await setupFinishedGame()

    // First request triggers GAME_REMATCH_REQUESTED
    const firstRequested = waitForEvent<RematchRequestedPayload>(s2, EVENTS.GAME_REMATCH_REQUESTED)
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await firstRequested

    // Second request should produce no event — wait 200ms to confirm silence
    let secondEventFired = false
    s2.once(
      EVENTS.GAME_REMATCH_REQUESTED,
      () => { secondEventFired = true },
    )

    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(secondEventFired).toBe(false)
  })

  it('both players request → emits GAME_REMATCH_ACCEPTED to room', async () => {
    const { s1, s2, p1, p2, code } = await setupFinishedGame()

    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)

    const accepted1 = waitForEvent(s1, EVENTS.GAME_REMATCH_ACCEPTED)
    const accepted2 = waitForEvent(s2, EVENTS.GAME_REMATCH_ACCEPTED)
    s2.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p2.playerId, code })

    await Promise.all([accepted1, accepted2])
  })

  it('after both request, new game is dealt to both players', async () => {
    const { s1, s2, p1, p2, code } = await setupFinishedGame()

    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)

    const dealt1 = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const dealt2 = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p2.playerId, code })

    const [d1, d2] = await Promise.all([dealt1, dealt2])
    expect(d1.hand).toHaveLength(13)
    expect(d2.hand).toHaveLength(13)
  })

  it('after rematch accepted, room status transitions to arranging', async () => {
    const { s1, s2, p1, p2, code } = await setupFinishedGame()

    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)

    // Register all event listeners BEFORE emitting P2's request
    const accepted1 = waitForEvent(s1, EVENTS.GAME_REMATCH_ACCEPTED)
    const dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)

    s2.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p2.playerId, code })

    await accepted1
    const d = await dealt
    // If GAME_DEALT was received with 13 cards, room moved to arranging successfully
    expect(d.hand).toHaveLength(13)
  })

  it('decline rematch → emits GAME_REMATCH_CANCELLED with reason declined', async () => {
    const { s1, s2, p1, p2, code } = await setupFinishedGame()

    // P1 requests
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)

    // P2 declines
    const cancelled1 = waitForEvent<RematchCancelledPayload>(s1, EVENTS.GAME_REMATCH_CANCELLED)
    const cancelled2 = waitForEvent<RematchCancelledPayload>(s2, EVENTS.GAME_REMATCH_CANCELLED)
    s2.emit(EVENTS.GAME_REMATCH_DECLINED, { playerId: p2.playerId, code })

    const [c1, c2] = await Promise.all([cancelled1, cancelled2])
    expect(c1.declinedBy).toBe(p2.playerId)
    expect(c1.reason).toBe('declined')
    expect(c2).toEqual(c1)
  })

  it('after decline, a fresh rematch request starts a new cycle', async () => {
    const { s1, s2, p1, p2, code } = await setupFinishedGame()

    // Round 1: P1 requests, P2 declines
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)
    s2.emit(EVENTS.GAME_REMATCH_DECLINED, { playerId: p2.playerId, code })
    await waitForEvent(s1, EVENTS.GAME_REMATCH_CANCELLED)

    // Round 2: P1 requests again → should emit GAME_REMATCH_REQUESTED again (not ERROR)
    const requested = waitForEvent<RematchRequestedPayload>(s2, EVENTS.GAME_REMATCH_REQUESTED)
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    const r = await requested
    expect(r.requestedBy).toBe(p1.playerId)
  })

  it('player disconnects after requesting → GAME_REMATCH_CANCELLED emitted with reason disconnected', async () => {
    const { s1, s2, p1, code } = await setupFinishedGame()

    // P1 requests rematch
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)

    // P1 disconnects — P2 should receive GAME_REMATCH_CANCELLED
    const cancelled = waitForEvent<RematchCancelledPayload>(s2, EVENTS.GAME_REMATCH_CANCELLED)
    s1.disconnect()

    const c = await cancelled
    expect(c.declinedBy).toBe(p1.playerId)
    expect(c.reason).toBe('disconnected')
  })

  it('player leaves room after requesting → GAME_REMATCH_CANCELLED emitted with reason left', async () => {
    const { s1, s2, p1, code } = await setupFinishedGame()

    // P1 requests rematch
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)

    // P1 leaves the room
    const cancelled = waitForEvent<RematchCancelledPayload>(s2, EVENTS.GAME_REMATCH_CANCELLED)
    s1.emit(EVENTS.ROOM_LEAVE, { playerId: p1.playerId, code })

    const c = await cancelled
    expect(c.declinedBy).toBe(p1.playerId)
    expect(c.reason).toBe('left')
  })

  it('p2 accepts after P1 already left → ERROR emitted to P2, no new game', async () => {
    const { s1, s2, p1, p2, code } = await setupFinishedGame()

    // P1 requests
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)

    // P1 leaves (this cancels rematch, P2 gets GAME_REMATCH_CANCELLED)
    const cancelled = waitForEvent<RematchCancelledPayload>(s2, EVENTS.GAME_REMATCH_CANCELLED)
    s1.emit(EVENTS.ROOM_LEAVE, { playerId: p1.playerId, code })
    await cancelled

    // P2 now tries to "accept" (send their own request)
    const err = waitForEvent<ErrorPayload>(s2, EVENTS.ERROR)
    s2.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p2.playerId, code })

    const e = await err
    expect(e.message).toBe('Opponent has left the room')
  })
})
