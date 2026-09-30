import type { Card, PlayerArrangement, RoundResult } from '@binh-13/shared'
import type { Socket } from 'socket.io-client'
import { EVENTS } from '@binh-13/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestServer } from '../../__tests__/helpers/createTestServer'
import {
  createSocketClient,
  waitForEvent,
} from '../../__tests__/helpers/socketClient'
import { updateRoomSettings } from '../../rooms/roomManager'
import { compareFiveCard } from '../evaluator'
import { createForfeitArrangement } from '../gameEvents'
import { getGame } from '../gameManager'

interface SessionCreatedPayload { playerId: number, name: string }
interface RoomPayload { code: string }
interface GameDealtPayload { hand: Card[], timerSeconds: number }
interface ErrorPayload { message: string }
interface HintPayload { arrangement: { group1: Card[], group2: Card[], group3: Card[] } }

describe('gameEvents integration', () => {
  let port = 0
  let closeServer: (() => Promise<void>) | undefined
  const sockets: Socket[] = []

  beforeEach(async () => {
    const server = await createTestServer()
    port = server.port
    closeServer = server.closeServer
  })

  afterEach(async () => {
    vi.useRealTimers()
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

  async function setupTwoPlayerRoom(): Promise<{
    s1: Socket
    s2: Socket
    p1: SessionCreatedPayload
    p2: SessionCreatedPayload
    code: string
  }> {
    const s1 = await connectClient()
    const s2 = await connectClient()
    const p1 = await createSession(s1, 'Alice')
    const p2 = await createSession(s2, 'Bob')

    const roomCreated = waitForEvent<RoomPayload>(s1, EVENTS.ROOM_CREATED)
    s1.emit(EVENTS.ROOM_CREATE, { playerId: p1.playerId })
    const { code } = await roomCreated

    return { s1, s2, p1, p2, code }
  }

  function validArrangement(playerId: number, hand: Card[]): PlayerArrangement {
    // Sort by rank value descending so group1 (back) has the strongest cards
    const RANK_ORDER = [
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'T',
      'J',
      'Q',
      'K',
      'A',
    ]
    const sorted = [...hand].sort(
      (a, b) => RANK_ORDER.indexOf(b.rank) - RANK_ORDER.indexOf(a.rank),
    )
    let group1 = sorted.slice(0, 5) as PlayerArrangement['group1']
    let group2 = sorted.slice(5, 10) as PlayerArrangement['group2']
    const group3 = sorted.slice(10, 13) as PlayerArrangement['group3']

    // Verify with pokersolver — if rank sorting didn't produce a valid arrangement
    // (e.g. lower-ranked cards formed a flush), swap to ensure group1 >= group2
    if (compareFiveCard(group1, group2) < 0) {
      ;[group1, group2] = [
        group2 as unknown as PlayerArrangement['group1'],
        group1 as unknown as PlayerArrangement['group2'],
      ]
    }

    return { playerId, group1, group2, group3 }
  }

  it('two players join → both receive game:dealt with 13 cards each', async () => {
    const { s1, s2, p1, p2, code } = await setupTwoPlayerRoom()

    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)

    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })

    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })

    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })

    const [d1, d2] = await Promise.all([p1Dealt, p2Dealt])
    expect(d1.hand).toHaveLength(13)
    expect(d2.hand).toHaveLength(13)
    // Timer now comes from room settings (DEFAULT_ROOM_SETTINGS.timerSeconds = 60)
    expect(d1.timerSeconds).toBe(60)
    expect(d2.timerSeconds).toBe(60)
  })

  it('dealt cards are unique per player (no overlap)', async () => {
    const { s1, s2, p1, p2, code } = await setupTwoPlayerRoom()

    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)

    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })

    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })

    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
    const [d1, d2] = await Promise.all([p1Dealt, p2Dealt])

    const ids1 = new Set(d1.hand.map(c => c.id))
    for (const card of d2.hand) {
      expect(ids1.has(card.id)).toBe(false)
    }
  })

  it('player submits valid arrangement → opponent receives game:opponent_submitted', async () => {
    const { s1, s2, p1, p2, code } = await setupTwoPlayerRoom()

    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)

    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })

    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })

    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
    const [d1] = await Promise.all([p1Dealt, p2Dealt])

    const opponentNotified = waitForEvent(s2, EVENTS.GAME_OPPONENT_SUBMITTED)
    s1.emit(EVENTS.GAME_SUBMIT, {
      playerId: p1.playerId,
      code,
      arrangement: validArrangement(p1.playerId, d1.hand),
    })

    await expect(opponentNotified).resolves.toBeDefined()
  })

  it('both submit → game:result emitted to both with correct structure', async () => {
    const { s1, s2, p1, p2, code } = await setupTwoPlayerRoom()

    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)

    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })

    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })

    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
    const [d1, d2] = await Promise.all([p1Dealt, p2Dealt])

    const p1Result = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const p2Result = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)

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

    const [r1, r2] = await Promise.all([p1Result, p2Result])
    expect(r1.winner).toMatch(/^(p1|p2|draw)$/)
    expect(r1.arrangements.p1).toBeDefined()
    expect(r1.arrangements.p2).toBeDefined()
    expect(r2).toEqual(r1) // both receive same result
  })

  it('submit with wrong cards → server rejects with error', async () => {
    const { s1, s2, p1, p2, code } = await setupTwoPlayerRoom()

    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })
    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
    await Promise.all([p1Dealt, p2Dealt])

    const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)

    // Inject a card not in the dealt hand
    const fakeCard: Card = { id: 'AS', rank: 'A', suit: 'S' }
    const badArrangement: PlayerArrangement = {
      playerId: p1.playerId,
      group1: [
        fakeCard,
        fakeCard,
        fakeCard,
        fakeCard,
        fakeCard,
      ] as PlayerArrangement['group1'],
      group2: [
        fakeCard,
        fakeCard,
        fakeCard,
        fakeCard,
        fakeCard,
      ] as PlayerArrangement['group2'],
      group3: [fakeCard, fakeCard, fakeCard] as PlayerArrangement['group3'],
    }

    s1.emit(EVENTS.GAME_SUBMIT, {
      playerId: p1.playerId,
      code,
      arrangement: badArrangement,
    })

    const error = await err
    expect(error.message).toBeTruthy()
  })

  it('submit with duplicate cards → server rejects', async () => {
    const { s1, s2, p1, p2, code } = await setupTwoPlayerRoom()

    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })
    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
    const [d1] = await Promise.all([p1Dealt, p2Dealt])

    const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)

    // Use same card 13 times
    const dupCard = d1.hand[0]
    s1.emit(EVENTS.GAME_SUBMIT, {
      playerId: p1.playerId,
      code,
      arrangement: {
        playerId: p1.playerId,
        group1: [dupCard, dupCard, dupCard, dupCard, dupCard],
        group2: [dupCard, dupCard, dupCard, dupCard, dupCard],
        group3: [dupCard, dupCard, dupCard],
      },
    })

    await expect(err).resolves.toBeTruthy()
  })

  it('foul arrangement is accepted but marked foul in result', async () => {
    const { s1, s2, p1, p2, code } = await setupTwoPlayerRoom()

    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })
    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
    const [d1, d2] = await Promise.all([p1Dealt, p2Dealt])

    // Use createForfeitArrangement which is guaranteed to produce a foul
    const foulArr = createForfeitArrangement(p1.playerId, d1.hand)

    const p1Result = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const p2Result = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)

    s1.emit(EVENTS.GAME_SUBMIT, {
      playerId: p1.playerId,
      code,
      arrangement: foulArr,
    })
    s2.emit(EVENTS.GAME_SUBMIT, {
      playerId: p2.playerId,
      code,
      arrangement: validArrangement(p2.playerId, d2.hand),
    })

    const [r1] = await Promise.all([p1Result, p2Result])
    expect(r1.p1Foul).toBe(true)
    expect(r1.winner).toBe('p2')
  })

  it('submit before game starts → error', async () => {
    const s1 = await connectClient()
    const p1 = await createSession(s1, 'Alice')

    const roomCreated = waitForEvent<RoomPayload>(s1, EVENTS.ROOM_CREATED)
    s1.emit(EVENTS.ROOM_CREATE, { playerId: p1.playerId })
    const { code } = await roomCreated

    const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)

    const fakeHand: Card[] = Array.from({ length: 13 }, (_, i) => ({
      id: `${i}S`,
      rank: '2' as Card['rank'],
      suit: 'S' as Card['suit'],
    }))

    s1.emit(EVENTS.GAME_SUBMIT, {
      playerId: p1.playerId,
      code,
      arrangement: {
        playerId: p1.playerId,
        group1: fakeHand.slice(0, 5),
        group2: fakeHand.slice(5, 10),
        group3: fakeHand.slice(10, 13),
      },
    })

    await expect(err).resolves.toBeTruthy()
  })

  it('submit twice → second submission rejected', async () => {
    const { s1, s2, p1, p2, code } = await setupTwoPlayerRoom()

    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })
    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
    const [d1] = await Promise.all([p1Dealt, p2Dealt])

    const arr = validArrangement(p1.playerId, d1.hand)
    s1.emit(EVENTS.GAME_SUBMIT, {
      playerId: p1.playerId,
      code,
      arrangement: arr,
    })

    // Wait a tick then try again
    await new Promise(r => setTimeout(r, 50))

    const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.GAME_SUBMIT, {
      playerId: p1.playerId,
      code,
      arrangement: arr,
    })

    await expect(err).resolves.toMatchObject({ message: 'Already submitted' })
  })

  it('game start deals cards and cleans up game after result', async () => {
    const { s1, s2, p1, p2, code } = await setupTwoPlayerRoom()

    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })
    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
    const [d1, d2] = await Promise.all([p1Dealt, p2Dealt])

    // Both players received hands
    expect(d1.hand).toHaveLength(13)
    expect(d2.hand).toHaveLength(13)

    // Submit both to trigger result + cleanup
    const p1Result = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
    const p2Result = waitForEvent<RoundResult>(s2, EVENTS.GAME_RESULT)

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

    await Promise.all([p1Result, p2Result])

    // After result, game instance should be cleaned up (endGame called)
    // Verify by trying to submit again — should get "Game not in progress"
    const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
    s1.emit(EVENTS.GAME_SUBMIT, {
      playerId: p1.playerId,
      code,
      arrangement: validArrangement(p1.playerId, d1.hand),
    })

    await expect(err).resolves.toMatchObject({
      message: 'Game not in progress',
    })
  }, 10_000)

  it('both players disconnect during game → timer expiry does not crash (FK constraint)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { s1, s2, p1, p2, code } = await setupTwoPlayerRoom()

    const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
    const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
    s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
    s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })
    s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
    await Promise.all([p1Dealt, p2Dealt])

    // Both players disconnect (simulating navigating away)
    s1.disconnect()
    s2.disconnect()

    // Wait a moment for disconnect handlers to fire
    await vi.advanceTimersByTimeAsync(500)

    // Advance time past the game timer (60s default) — this should NOT throw
    // Previously this caused SqliteError: FOREIGN KEY constraint failed
    await vi.advanceTimersByTimeAsync(61_000)

    // If we get here without a crash, the bug is fixed.
    // The game timer should have been cancelled when the room was cleared.
    expect(true).toBe(true)
  }, 15_000)

  describe('drafts and hints', () => {
    async function startDealtGame() {
      const room = await setupTwoPlayerRoom()
      const { s1, s2, p1, p2, code } = room
      const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
      const p2Dealt = waitForEvent<GameDealtPayload>(s2, EVENTS.GAME_DEALT)
      s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
      s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })
      s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
      const [d1, d2] = await Promise.all([p1Dealt, p2Dealt])
      return { ...room, d1, d2 }
    }

    /** The server handles one socket's events in order, so a hint reply means the draft was handled. */
    async function roundTrip(socket: Socket, playerId: number, code: string) {
      const hint = waitForEvent<HintPayload>(socket, EVENTS.GAME_HINT)
      socket.emit(EVENTS.GAME_HINT_REQUEST, { playerId, code })
      return hint
    }

    it('game:draft stores the latest valid board without a reply', async () => {
      const { s1, p1, code, d1 } = await startDealtGame()
      const draft = validArrangement(p1.playerId, d1.hand)

      s1.emit(EVENTS.GAME_DRAFT, { playerId: p1.playerId, code, arrangement: draft })
      await roundTrip(s1, p1.playerId, code)

      expect(getGame(code)!.drafts.get(p1.playerId)).toEqual(draft)
    })

    it('game:draft with foreign cards → error, and no draft is stored', async () => {
      const { s1, p1, code, d1, d2 } = await startDealtGame()
      const draft = validArrangement(p1.playerId, d1.hand)
      draft.group3[0] = d2.hand[0]

      const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
      s1.emit(EVENTS.GAME_DRAFT, { playerId: p1.playerId, code, arrangement: draft })

      expect((await err).message).toBe('Invalid cards in arrangement')
      expect(getGame(code)!.drafts.has(p1.playerId)).toBe(false)
    })

    it('game:draft after submit → error, and the submission does not change', async () => {
      const { s1, s2, p1, code, d1 } = await startDealtGame()
      const submitted = validArrangement(p1.playerId, d1.hand)
      const opponentNotified = waitForEvent(s2, EVENTS.GAME_OPPONENT_SUBMITTED)
      s1.emit(EVENTS.GAME_SUBMIT, { playerId: p1.playerId, code, arrangement: submitted })
      await opponentNotified

      const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
      const other = { ...submitted, group1: submitted.group2, group2: submitted.group1 }
      s1.emit(EVENTS.GAME_DRAFT, { playerId: p1.playerId, code, arrangement: other })

      expect((await err).message).toBe('Already submitted')
      expect(getGame(code)!.submissions.get(p1.playerId)).toEqual(submitted)
      expect(getGame(code)!.drafts.has(p1.playerId)).toBe(false)
    })

    it('game:hint_request → only the requester gets game:hint with the dealt cards', async () => {
      const { s1, s2, p1, p2, code, d1, d2 } = await startDealtGame()
      const s2Hints = vi.fn()
      s2.on(EVENTS.GAME_HINT, s2Hints)

      const { arrangement } = await roundTrip(s1, p1.playerId, code)

      const ids = [...arrangement.group1, ...arrangement.group2, ...arrangement.group3].map(c => c.id)
      expect(arrangement.group1).toHaveLength(5)
      expect(arrangement.group2).toHaveLength(5)
      expect(arrangement.group3).toHaveLength(3)
      expect(ids.sort()).toEqual(d1.hand.map(c => c.id).sort())
      expect(compareFiveCard(arrangement.group1, arrangement.group2)).toBeGreaterThanOrEqual(0)

      // s2 gets exactly one hint, the reply to its own request, with its own cards.
      const own = await roundTrip(s2, p2.playerId, code)
      expect(s2Hints).toHaveBeenCalledTimes(1)
      const ownIds = [...own.arrangement.group1, ...own.arrangement.group2, ...own.arrangement.group3].map(c => c.id)
      expect(ownIds.sort()).toEqual(d2.hand.map(c => c.id).sort())
    })

    it('surrender still uses the forfeit arrangement, even with a draft', async () => {
      const { s1, p1, code, d1 } = await startDealtGame()
      s1.emit(EVENTS.GAME_DRAFT, { playerId: p1.playerId, code, arrangement: validArrangement(p1.playerId, d1.hand) })
      await roundTrip(s1, p1.playerId, code)

      const result = waitForEvent<RoundResult>(s1, EVENTS.GAME_RESULT)
      s1.emit(EVENTS.GAME_SURRENDER, { playerId: p1.playerId, code })
      const { arrangements } = await result

      const mine = arrangements.p1.playerId === p1.playerId ? arrangements.p1 : arrangements.p2
      expect(mine).toEqual(createForfeitArrangement(p1.playerId, d1.hand))
    })
  })

  describe('instant wins with allowFoul off', () => {
    function cards(ids: string): Card[] {
      return ids.split(' ').map(id => ({ id, rank: id[0] as Card['rank'], suit: id[1] as Card['suit'] }))
    }

    async function startNoFoulGame(back: string, middle: string, front: string) {
      const { s1, s2, p1, p2, code } = await setupTwoPlayerRoom()
      const p1Dealt = waitForEvent<GameDealtPayload>(s1, EVENTS.GAME_DEALT)
      s2.emit(EVENTS.ROOM_JOIN, { playerId: p2.playerId, code })
      s1.emit(EVENTS.ROOM_READY, { playerId: p1.playerId, code, ready: true })
      s2.emit(EVENTS.ROOM_READY, { playerId: p2.playerId, code, ready: true })
      await p1Dealt

      updateRoomSettings(code, { allowFoul: false })
      const arrangement = { group1: cards(back), group2: cards(middle), group3: cards(front) }
      getGame(code)!.hands.set(p1.playerId, [...arrangement.group1, ...arrangement.group2, ...arrangement.group3])
      return { s1, s2, p1, code, arrangement }
    }

    it('accepts a fouled Three flushes board', async () => {
      // Middle (ace-high flush) beats Back (jack-high flush): a foul, but an instant win.
      const { s1, s2, p1, code, arrangement } = await startNoFoulGame('JS 9S 6S 4S 2S', 'AH QH 8H 5H 3H', 'KD TD 9D')

      const opponentNotified = waitForEvent(s2, EVENTS.GAME_OPPONENT_SUBMITTED)
      s1.emit(EVENTS.GAME_SUBMIT, { playerId: p1.playerId, code, arrangement })

      await expect(opponentNotified).resolves.toBeDefined()
    })

    it('still rejects a foul board without an instant win', async () => {
      const { s1, p1, code, arrangement } = await startNoFoulGame('2S 3H 4D 6C 8S', 'KS KH QS QH JC', '3S 4H 5C')

      const err = waitForEvent<ErrorPayload>(s1, EVENTS.ERROR)
      s1.emit(EVENTS.GAME_SUBMIT, { playerId: p1.playerId, code, arrangement })

      expect((await err).message).toBe('Foul arrangements are not allowed in this room')
    })
  })
})
