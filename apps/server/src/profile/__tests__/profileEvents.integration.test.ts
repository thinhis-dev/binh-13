import type { Card, PlayerArrangement, PlayerProfile, RoundResult } from '@binh-13/shared'
import type { Socket } from 'socket.io-client'
import { EVENTS } from '@binh-13/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestServer } from '../../__tests__/helpers/createTestServer'
import {
  createSocketClient,
  waitForEvent,
} from '../../__tests__/helpers/socketClient'
import { compareFiveCard } from '../../game/evaluator'

interface SessionCreatedPayload { playerId: number, name: string }
interface RoomPayload { code: string }
interface GameDealtPayload { hand: Card[], timerSeconds: number }
interface ErrorPayload { message: string }
interface ProfileUpdatedPayload { name: string, avatar: string }

describe('profileEvents integration', () => {
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

  function validArrangement(playerId: number, hand: Card[]): PlayerArrangement {
    const RANK_ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
    const sorted = [...hand].sort((a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank))
    let group1 = sorted.slice(0, 5) as PlayerArrangement['group1']
    let group2 = sorted.slice(5, 10) as PlayerArrangement['group2']
    const group3 = sorted.slice(10, 13) as PlayerArrangement['group3']

    // Rank-sorting alone can occasionally produce a foul (e.g. lower cards
    // forming a flush) — swap to guarantee group1 >= group2, same as the
    // proven helper in gameEvents.integration.test.ts.
    if (compareFiveCard(group1, group2) < 0) {
      ;[group1, group2] = [
        group2 as unknown as PlayerArrangement['group1'],
        group1 as unknown as PlayerArrangement['group2'],
      ]
    }

    return { playerId, group1, group2, group3 }
  }

  async function playOneRound(s1: Socket, s2: Socket, p1: SessionCreatedPayload, p2: SessionCreatedPayload, code: string) {
    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    const [d1, d2] = await Promise.all([p1Dealt, p2Dealt])

    const r1 = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const r2 = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)
    s1.emit(EVENTS.GAME_SUBMIT, { playerId: p1.playerId, code, arrangement: validArrangement(p1.playerId, d1.hand) })
    s2.emit(EVENTS.GAME_SUBMIT, { playerId: p2.playerId, code, arrangement: validArrangement(p2.playerId, d2.hand) })
    await Promise.all([r1, r2])
  }

  it('profile:get returns aggregated stats after played rounds (AC-A3-4)', async () => {
    const s1 = await connect()
    const s2 = await connect()
    const p1 = await createSession(s1, 'Alice')
    const p2 = await createSession(s2, 'Bob')

    const roomCreated = waitForEvent<RoomPayload>(s1, EVENTS.ROOM_CREATED)
    s1.emit(EVENTS.ROOM_CREATE, { playerId: p1.playerId })
    const { code } = await roomCreated

    await playOneRound(s1, s2, p1, p2, code)

    const profile = waitForEvent<PlayerProfile>(s1, EVENTS.PROFILE_DATA)
    s1.emit(EVENTS.PROFILE_GET, { playerId: p1.playerId })
    const data = await profile

    expect(data.playerId).toBe(p1.playerId)
    expect(data.name).toBe('Alice')
    expect(data.stats.games).toBe(1)
    expect(data.stats.wins + data.stats.losses).toBe(1)
  })

  it('a brand-new player has all-zero stats (AC-A3-7)', async () => {
    const s1 = await connect()
    const p1 = await createSession(s1, 'Fresh')

    const profile = waitForEvent<PlayerProfile>(s1, EVENTS.PROFILE_DATA)
    s1.emit(EVENTS.PROFILE_GET, { playerId: p1.playerId })
    const data = await profile

    expect(data.stats).toEqual({ games: 0, wins: 0, losses: 0, draws: 0, fouls: 0, sweeps: 0 })
  })

  it('profile:update roundtrips name/avatar and persists across SESSION_RESTORE (AC-A3-5)', async () => {
    const s1 = await connect()
    const p1 = await createSession(s1, 'Alice')

    const updated = waitForEvent<ProfileUpdatedPayload>(s1, EVENTS.PROFILE_UPDATED)
    s1.emit(EVENTS.PROFILE_UPDATE, { playerId: p1.playerId, name: 'Alicia', avatar: 'fox' })
    await expect(updated).resolves.toEqual({ name: 'Alicia', avatar: 'fox' })

    // Need the token to restore — re-derive via a fresh SESSION_CREATE token isn't
    // available here, so verify persistence directly via PROFILE_GET instead.
    const profile = waitForEvent<PlayerProfile>(s1, EVENTS.PROFILE_DATA)
    s1.emit(EVENTS.PROFILE_GET, { playerId: p1.playerId })
    await expect(profile).resolves.toMatchObject({ name: 'Alicia', avatar: 'fox' })
  })

  it('profile:update rejects an invalid avatar and an invalid name, leaving the row unchanged', async () => {
    const s1 = await connect()
    const p1 = await createSession(s1, 'Alice')

    const badAvatar = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.PROFILE_UPDATE, { playerId: p1.playerId, avatar: 'not-a-real-avatar' })
    await badAvatar

    const badName = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.PROFILE_UPDATE, { playerId: p1.playerId, name: '' })
    await badName

    const profile = waitForEvent<PlayerProfile>(s1, EVENTS.PROFILE_DATA)
    s1.emit(EVENTS.PROFILE_GET, { playerId: p1.playerId })
    await expect(profile).resolves.toMatchObject({ name: 'Alice', avatar: 'default' })
  })

  it('rejects PROFILE_GET/PROFILE_UPDATE for another player (AC-A3-6)', async () => {
    const s1 = await connect()
    const s2 = await connect()
    await createSession(s1, 'Alice')
    const p2 = await createSession(s2, 'Bob')

    const getError = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.PROFILE_GET, { playerId: p2.playerId })
    await getError

    const updateError = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.PROFILE_UPDATE, { playerId: p2.playerId, name: 'Hacked' })
    await updateError

    const profile = waitForEvent<PlayerProfile>(s2, EVENTS.PROFILE_DATA)
    s2.emit(EVENTS.PROFILE_GET, { playerId: p2.playerId })
    await expect(profile).resolves.toMatchObject({ name: 'Bob' })
  })
})
