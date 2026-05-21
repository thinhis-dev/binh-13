/**
 * Integration tests for the rematch flow.
 * These tests use a real in-memory SQLite database and a real Socket.io server
 * bound to port 0. No mocks are used for the database or transport.
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
interface RematchCancelledPayload { declinedBy: number, reason: string }
interface ErrorPayload { message: string }

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

describe('rematch integration', () => {
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

  async function createSession(s: Socket, name: string): Promise<SessionPayload> {
    const p = waitForEvent<SessionPayload>(s, EVENTS.SESSION_CREATED)
    s.emit(EVENTS.SESSION_CREATE, { name })
    return p
  }

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

    return { s1, s2, p1, p2, code, d1, d2 }
  }

  it('full happy path: play → finish → both rematch → new round dealt', async () => {
    const { s1, s2, p1, p2, code } = await setupFinishedGame()

    // P1 requests
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)

    // P2 accepts
    const accepted1 = waitForEvent(s1, EVENTS.GAME_REMATCH_ACCEPTED)
    const accepted2 = waitForEvent(s2, EVENTS.GAME_REMATCH_ACCEPTED)
    const newDealt1 = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const newDealt2 = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)

    s2.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p2.playerId, code })

    await Promise.all([accepted1, accepted2])
    const [nd1, nd2] = await Promise.all([newDealt1, newDealt2])

    expect(nd1.hand).toHaveLength(13)
    expect(nd2.hand).toHaveLength(13)

    // Verify new hands are distinct
    const ids1 = new Set(nd1.hand.map(c => c.id))
    for (const card of nd2.hand) {
      expect(ids1.has(card.id)).toBe(false)
    }
  })

  it('p1 requests, P2 declines, P1 requests again — fresh cycle works', async () => {
    const { s1, s2, p1, p2, code } = await setupFinishedGame()

    // First cycle: P1 requests, P2 declines
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)
    s2.emit(EVENTS.GAME_REMATCH_DECLINED, { playerId: p2.playerId, code })
    await waitForEvent(s1, EVENTS.GAME_REMATCH_CANCELLED)

    // Second cycle: P1 requests again, P2 now accepts
    const requested2 = waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await requested2

    const accepted1 = waitForEvent(s1, EVENTS.GAME_REMATCH_ACCEPTED)
    const accepted2 = waitForEvent(s2, EVENTS.GAME_REMATCH_ACCEPTED)
    const dealt1 = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const dealt2 = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p2.playerId, code })

    await Promise.all([accepted1, accepted2])
    const [d1, d2] = await Promise.all([dealt1, dealt2])
    expect(d1.hand).toHaveLength(13)
    expect(d2.hand).toHaveLength(13)
  })

  it('simultaneous requests — both clients receive GAME_REMATCH_ACCEPTED and new game starts', async () => {
    const { s1, s2, p1, p2, code } = await setupFinishedGame()

    // Both emit before receiving any response
    const accepted1 = waitForEvent(s1, EVENTS.GAME_REMATCH_ACCEPTED)
    const accepted2 = waitForEvent(s2, EVENTS.GAME_REMATCH_ACCEPTED)
    const dealt1 = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const dealt2 = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)

    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    s2.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p2.playerId, code })

    await Promise.all([accepted1, accepted2])
    const [d1, d2] = await Promise.all([dealt1, dealt2])
    expect(d1.hand).toHaveLength(13)
    expect(d2.hand).toHaveLength(13)
  })

  it('disconnect during pending rematch → GAME_REMATCH_CANCELLED sent to remaining player', async () => {
    const { s1, s2, p1, code } = await setupFinishedGame()

    // P1 requests, then disconnects
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)

    const cancelled = waitForEvent<RematchCancelledPayload>(s2, EVENTS.GAME_REMATCH_CANCELLED)
    s1.disconnect()

    const c = await cancelled
    expect(c.declinedBy).toBe(p1.playerId)
    expect(c.reason).toBe('disconnected')
  })

  it('p1 requests, P1 leaves, P2 accepts → P2 gets ERROR, no new game starts', async () => {
    const { s1, s2, p1, p2, code } = await setupFinishedGame()

    // P1 requests
    s1.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p1.playerId, code })
    await waitForEvent(s2, EVENTS.GAME_REMATCH_REQUESTED)

    // P1 leaves — P2 gets GAME_REMATCH_CANCELLED
    s1.emit(EVENTS.ROOM_LEAVE, { playerId: p1.playerId, code })
    await waitForEvent<RematchCancelledPayload>(s2, EVENTS.GAME_REMATCH_CANCELLED)

    // Confirm no new game started (no GAME_DEALT for P2 in 300ms)
    let newGameStarted = false
    s2.once(
      EVENTS.GAME_DEALT,
      () => { newGameStarted = true },
    )

    // P2 tries to accept after P1 left
    const err = waitForEvent<ErrorPayload>(s2, EVENTS.ERROR)
    s2.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId: p2.playerId, code })

    await expect(err).resolves.toMatchObject({ message: 'Opponent has left the room' })

    await new Promise(resolve => setTimeout(resolve, 200))
    expect(newGameStarted).toBe(false)
  })
})
