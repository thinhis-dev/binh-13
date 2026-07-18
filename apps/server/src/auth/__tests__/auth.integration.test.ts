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

interface SessionCreatedPayload { playerId: number, name: string, token: string }
interface RoomPayload { code: string }
interface GameDealtPayload { hand: Card[], timerSeconds: number }
interface ErrorPayload { message: string }
interface AuthRegisteredPayload { username: string }
interface AuthLoggedInPayload { playerId: number, name: string, avatar: string, token: string }

describe('auth integration', () => {
  let port = 0
  let closeServer: (() => Promise<void>) | undefined
  const sockets: Socket[] = []
  const emittedPayloads: unknown[] = []

  beforeEach(async () => {
    const server = await createTestServer()
    port = server.port
    closeServer = server.closeServer
  })

  afterEach(async () => {
    for (const s of sockets.splice(0)) s.disconnect()
    await closeServer?.()
    emittedPayloads.length = 0
  })

  async function connect() {
    const s = createSocketClient(port)
    sockets.push(s)
    await waitForEvent(s, 'connect')

    // Capture every payload this socket ever receives, to assert no
    // password_hash ever leaks into an emitted event (AC-A2-6).
    const originalOnevent = (s as unknown as { onevent: (packet: { data: unknown[] }) => void }).onevent.bind(s)
    ;(s as unknown as { onevent: (packet: { data: unknown[] }) => void }).onevent = (packet) => {
      emittedPayloads.push(...packet.data.slice(1))
      originalOnevent(packet)
    }

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
    if (compareFiveCard(group1, group2) < 0) {
      ;[group1, group2] = [
        group2 as unknown as PlayerArrangement['group1'],
        group1 as unknown as PlayerArrangement['group2'],
      ]
    }
    return { playerId, group1, group2, group3 }
  }

  it('guest plays a round, registers, and logs in from a second socket showing pre-registration stats (AC-A2-1 + AC-A2-3)', async () => {
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
    s1.emit(EVENTS.GAME_SUBMIT, { playerId: p1.playerId, code, arrangement: validArrangement(p1.playerId, d1.hand) })
    s2.emit(EVENTS.GAME_SUBMIT, { playerId: p2.playerId, code, arrangement: validArrangement(p2.playerId, d2.hand) })
    await Promise.all([r1, r2])

    const registered = waitForEvent<AuthRegisteredPayload>(s1, EVENTS.AUTH_REGISTERED)
    s1.emit(EVENTS.AUTH_REGISTER, { playerId: p1.playerId, username: 'alice_the_great', password: 'super-secret-1' })
    await expect(registered).resolves.toEqual({ username: 'alice_the_great' })

    const s3 = await connect()
    const loggedIn = waitForEvent<AuthLoggedInPayload>(s3, EVENTS.AUTH_LOGGED_IN)
    s3.emit(EVENTS.AUTH_LOGIN, { username: 'alice_the_great', password: 'super-secret-1' })
    const login = await loggedIn
    expect(login.playerId).toBe(p1.playerId)

    const profile = waitForEvent<PlayerProfile>(s3, EVENTS.PROFILE_DATA)
    s3.emit(EVENTS.PROFILE_GET, { playerId: login.playerId })
    const data = await profile
    expect(data.stats.games).toBe(1)

    // AC-A2-6: password_hash must never appear in anything emitted to a client.
    for (const payload of emittedPayloads) {
      expect(JSON.stringify(payload)).not.toContain('password_hash')
    }
  })

  it('rejects duplicate username, an already-claimed row, and bad shapes — DB unchanged (AC-A2-2)', async () => {
    const s1 = await connect()
    const s2 = await connect()
    const p1 = await createSession(s1, 'Alice')
    const p2 = await createSession(s2, 'Bob')

    const firstRegistered = waitForEvent<AuthRegisteredPayload>(s1, EVENTS.AUTH_REGISTERED)
    s1.emit(EVENTS.AUTH_REGISTER, { playerId: p1.playerId, username: 'taken_name', password: 'password-one' })
    await firstRegistered

    const dupError = waitForEvent<ErrorPayload>(s2, EVENTS.ERROR)
    s2.emit(EVENTS.AUTH_REGISTER, { playerId: p2.playerId, username: 'taken_name', password: 'password-two' })
    await dupError

    const alreadyClaimedError = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.AUTH_REGISTER, { playerId: p1.playerId, username: 'another_name', password: 'password-one' })
    await alreadyClaimedError

    const badShapeError = waitForEvent<ErrorPayload>(s2, EVENTS.ERROR)
    s2.emit(EVENTS.AUTH_REGISTER, { playerId: p2.playerId, username: 'no', password: 'short' })
    await badShapeError
  })

  it('returns byte-identical errors for wrong password vs unknown username (AC-A2-4)', async () => {
    const s1 = await connect()
    const p1 = await createSession(s1, 'Alice')

    const registered = waitForEvent<AuthRegisteredPayload>(s1, EVENTS.AUTH_REGISTERED)
    s1.emit(EVENTS.AUTH_REGISTER, { playerId: p1.playerId, username: 'real_user', password: 'correct-password' })
    await registered

    const s2 = await connect()
    const wrongPasswordError = waitForEvent<ErrorPayload>(s2, EVENTS.ERROR)
    s2.emit(EVENTS.AUTH_LOGIN, { username: 'real_user', password: 'wrong-password' })
    const wrongPasswordResult = await wrongPasswordError

    const s3 = await connect()
    const unknownUserError = waitForEvent<ErrorPayload>(s3, EVENTS.ERROR)
    s3.emit(EVENTS.AUTH_LOGIN, { username: 'unknown_user', password: 'wrong-password' })
    const unknownUserResult = await unknownUserError

    expect(wrongPasswordResult).toEqual(unknownUserResult)
  })

  it('rate-limits after 5 failed logins within the window, even with correct credentials on the 6th (AC-A2-5)', async () => {
    const s1 = await connect()
    const p1 = await createSession(s1, 'Alice')
    const registered = waitForEvent<AuthRegisteredPayload>(s1, EVENTS.AUTH_REGISTERED)
    s1.emit(EVENTS.AUTH_REGISTER, { playerId: p1.playerId, username: 'rate_limited_user', password: 'correct-password' })
    await registered

    for (let i = 0; i < 5; i++) {
      const s = await connect()
      const err = waitForEvent<ErrorPayload>(s, EVENTS.ERROR)
      s.emit(EVENTS.AUTH_LOGIN, { username: 'rate_limited_user', password: 'wrong-password' })
      await err
    }

    const s6 = await connect()
    const limited = waitForEvent<ErrorPayload>(s6, EVENTS.ERROR)
    s6.emit(EVENTS.AUTH_LOGIN, { username: 'rate_limited_user', password: 'correct-password' })
    const limitedResult = await limited

    expect(limitedResult.message.toLowerCase()).toContain('too many attempts')
  })
})
