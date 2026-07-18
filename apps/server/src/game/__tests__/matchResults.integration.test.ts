import type { Card, PlayerArrangement, RoundResult } from '@binh-13/shared'
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
interface GameDealtPayload { hand: Card[], timerSeconds: number }
interface RoomLeftPayload { playerId: number }

describe('matchResults integration', () => {
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

  function validArrangement(playerId: number, hand: Card[]): PlayerArrangement {
    const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
    const sorted = [...hand].sort((a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank))
    return {
      playerId,
      group1: sorted.slice(0, 5) as PlayerArrangement['group1'],
      group2: sorted.slice(5, 10) as PlayerArrangement['group2'],
      group3: sorted.slice(10, 13) as PlayerArrangement['group3'],
    }
  }

  it('a full round played over real sockets records one row that outlives the room (AC-A3-1)', async () => {
    const { s1, s2, p1, p2, code, d1, d2 } = await setupGameRoom()

    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const r2 = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)

    s1.emit(EVENTS.GAME_SUBMIT, { playerId: p1.playerId, code, arrangement: validArrangement(p1.playerId, d1.hand) })
    s2.emit(EVENTS.GAME_SUBMIT, { playerId: p2.playerId, code, arrangement: validArrangement(p2.playerId, d2.hand) })

    await Promise.all([r1, r2])

    const rowsAfterGame = getDb().prepare('SELECT * FROM match_results WHERE room_code = ?').all(code)
    expect(rowsAfterGame).toHaveLength(1)

    // Both players leave — the room row (and its cascades) get deleted.
    const left1 = waitForEvent<RoomLeftPayload>(s2, EVENTS.ROOM_LEFT)
    s1.emit(EVENTS.ROOM_LEAVE, { playerId: p1.playerId, code })
    await left1
    s2.emit(EVENTS.ROOM_LEAVE, { playerId: p2.playerId, code })
    await new Promise(resolve => setTimeout(resolve, 100))

    const room = getDb().prepare('SELECT * FROM rooms WHERE code = ?').get(code)
    expect(room).toBeUndefined()

    const rowsAfterRoomGone = getDb().prepare('SELECT * FROM match_results WHERE room_code = ?').all(code)
    expect(rowsAfterRoomGone).toHaveLength(1)
  })

  it('a surrender records a row with surrendered_by set (AC-A3-2)', async () => {
    const { s1, s2, p1, code } = await setupGameRoom()

    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const r2 = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)

    s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })
    await Promise.all([r1, r2])

    const row = getDb().prepare('SELECT * FROM match_results WHERE room_code = ?').get(code) as {
      surrendered_by: number
      p1_score: number
      p2_score: number
    }
    expect(row.surrendered_by).toBe(p1.playerId)
    expect(row.p1_score).toBe(0)
    expect(row.p2_score).toBe(3)
  })
})
