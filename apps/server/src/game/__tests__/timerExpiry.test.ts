import type { Card, PlayerArrangement, RoundResult } from '@binh-13/shared'
import type { Server } from 'socket.io'
import { EVENTS } from '@binh-13/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { autoArrange } from '../autoArrange'
import { handleTimerExpiry } from '../gameEvents'
import { endGame, getGame, saveDraft, startGame, submitArrangement } from '../gameManager'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCard(rank: Card['rank'], suit: Card['suit']): Card {
  return { id: `${rank}${suit}`, rank, suit }
}

function makeMockIo() {
  const emitted: Array<{ event: string, payload: unknown }> = []
  const to = vi.fn().mockReturnValue({
    emit: vi.fn((event: string, payload: unknown) => {
      emitted.push({ event, payload })
    }),
  })
  return { to, emitted } as unknown as Server & {
    emitted: Array<{ event: string, payload: unknown }>
  }
}

function validArrangementFromHand(
  playerId: number,
  hand: Card[],
): PlayerArrangement {
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
  return {
    playerId,
    group1: sorted.slice(0, 5) as PlayerArrangement['group1'],
    group2: sorted.slice(5, 10) as PlayerArrangement['group2'],
    group3: sorted.slice(10, 13) as PlayerArrangement['group3'],
  }
}

function emittedResult(io: Server): RoundResult {
  const emitted = (io as unknown as { emitted: Array<{ event: string, payload: unknown }> }).emitted
  const result = emitted.find(e => e.event === EVENTS.GAME_RESULT)
  expect(result).toBeDefined()
  return result!.payload as RoundResult
}

const FIXED_HAND = 'AS AH AD 9C 9S KS KH 7D 6C 2D QS QH 3C'.split(' ').map(id =>
  makeCard(id[0] as Card['rank'], id[1] as Card['suit']))

// ─── Mock DB and dependencies ────────────────────────────────────────────────

vi.mock('../../db', () => ({
  getDb: () => ({
    prepare: () => ({
      run: vi.fn(),
      get: vi.fn(() => ({ maxRound: 0 })),
    }),
  }),
}))

vi.mock('../../rooms/roomManager', () => ({
  updateRoomStatus: vi.fn(),
}))

vi.mock('../../session/sessionManager', () => ({
  getSession: vi.fn(() => ({ socketId: 'mock-socket-id' })),
}))

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('handleTimerExpiry', () => {
  const ROOM = 'TMREXP'

  afterEach(() => {
    endGame(ROOM)
  })

  it('auto-forfeits both players when neither submitted', () => {
    const io = makeMockIo()
    const game = startGame(ROOM, [1, 2], 5)

    handleTimerExpiry(io as unknown as Server, ROOM)

    // Should have emitted GAME_RESULT to the room
    const resultEmit = (io as any).emitted?.find(
      (e: any) => e.event === EVENTS.GAME_RESULT,
    )
    // Since io.to returns a mock, check that to() was called
    expect(io.to).toHaveBeenCalledWith(ROOM)
  })

  it('auto-forfeits only the non-submitting player', () => {
    const io = makeMockIo()
    const game = startGame(ROOM, [1, 2], 5)

    // Player 1 submits a valid arrangement
    const hand1 = game.hands.get(1)!
    const p1Arr = validArrangementFromHand(1, hand1)
    submitArrangement(ROOM, 1, p1Arr)

    handleTimerExpiry(io as unknown as Server, ROOM)

    // Game should have been resolved
    expect(io.to).toHaveBeenCalledWith(ROOM)
  })

  it('is a no-op when game does not exist', () => {
    const io = makeMockIo()
    // Should not throw
    expect(() =>
      handleTimerExpiry(io as unknown as Server, 'NOROOM'),
    ).not.toThrow()
    expect(io.to).not.toHaveBeenCalled()
  })

  it('is a no-op when game is not in arranging status', () => {
    const io = makeMockIo()
    const game = startGame(ROOM, [1, 2], 5)
    game.status = 'finished'

    handleTimerExpiry(io as unknown as Server, ROOM)

    expect(io.to).not.toHaveBeenCalled()
  })

  it('cleans up game instance after resolving (endGame called)', () => {
    const io = makeMockIo()
    startGame(ROOM, [1, 2], 5)

    handleTimerExpiry(io as unknown as Server, ROOM)

    // endGame should have been called by resolveRound → game no longer exists
    expect(getGame(ROOM)).toBeUndefined()
  })

  it('endGame cancels timer so handleTimerExpiry never fires after room deletion', () => {
    vi.useFakeTimers()
    const io = makeMockIo()
    const game = startGame(ROOM, [1, 2], 5)

    // Simulate a running timer
    let timerFired = false
    game.timerHandle = setInterval(() => {
      timerFired = true
      handleTimerExpiry(io as unknown as Server, ROOM)
    }, 1000)

    // Simulate what should happen when both players disconnect: endGame is called
    endGame(ROOM)

    // Advance time past the timer interval
    vi.advanceTimersByTime(5000)

    // Timer callback should NOT have fired because endGame cleared it
    expect(timerFired).toBe(false)
    expect(getGame(ROOM)).toBeUndefined()
    vi.useRealTimers()
  })

  it('is a no-op when game was ended (room cleared) before timer expires', () => {
    const io = makeMockIo()
    startGame(ROOM, [1, 2], 5)

    // Simulate room cleared → endGame called
    endGame(ROOM)

    // Now timer fires but game no longer exists
    expect(() =>
      handleTimerExpiry(io as unknown as Server, ROOM),
    ).not.toThrow()
    expect(io.to).not.toHaveBeenCalled()
  })

  describe('arrangement at timeout', () => {
    it('uses a valid draft', () => {
      const io = makeMockIo()
      const game = startGame(ROOM, [1, 2], 5)
      game.hands.set(1, FIXED_HAND)
      const auto = autoArrange(1, FIXED_HAND)
      const draft = { ...auto, group1: [...auto.group1].reverse() as PlayerArrangement['group1'] }
      saveDraft(ROOM, 1, draft)

      handleTimerExpiry(io as unknown as Server, ROOM)

      expect(emittedResult(io).arrangements.p1).toEqual(draft)
    })

    it('uses the auto-arrangement for a foul draft', () => {
      const io = makeMockIo()
      const game = startGame(ROOM, [1, 2], 5)
      game.hands.set(1, FIXED_HAND)
      const auto = autoArrange(1, FIXED_HAND)
      saveDraft(ROOM, 1, {
        ...auto,
        group1: auto.group2 as PlayerArrangement['group1'],
        group2: auto.group1 as PlayerArrangement['group2'],
      })

      handleTimerExpiry(io as unknown as Server, ROOM)

      expect(emittedResult(io).arrangements.p1).toEqual(auto)
    })

    it('uses the auto-arrangement without a draft, so no player fouls', () => {
      const io = makeMockIo()
      const game = startGame(ROOM, [1, 2], 5)
      const hand2 = game.hands.get(2)!
      game.hands.set(1, FIXED_HAND)

      handleTimerExpiry(io as unknown as Server, ROOM)

      const result = emittedResult(io)
      expect(result.arrangements.p1).toEqual(autoArrange(1, FIXED_HAND))
      expect(result.arrangements.p2).toEqual(autoArrange(2, hand2))
      expect(result.p1Foul).toBe(false)
      expect(result.p2Foul).toBe(false)
    })
  })

  it('uses a fouled Three flushes draft, and that player wins by instant win', () => {
    const io = makeMockIo()
    const game = startGame(ROOM, [1, 2], 5)
    const threeFlushes = 'JS 9S 6S 4S 2S AH QH 8H 5H 3H KD TD 9D'.split(' ').map(id =>
      makeCard(id[0] as Card['rank'], id[1] as Card['suit']))
    game.hands.set(1, threeFlushes)
    game.hands.set(2, FIXED_HAND)
    const draft: PlayerArrangement = {
      playerId: 1,
      group1: threeFlushes.slice(0, 5) as PlayerArrangement['group1'],
      group2: threeFlushes.slice(5, 10) as PlayerArrangement['group2'],
      group3: threeFlushes.slice(10, 13) as PlayerArrangement['group3'],
    }
    saveDraft(ROOM, 1, draft)

    handleTimerExpiry(io as unknown as Server, ROOM)

    const result = emittedResult(io)
    expect(result.arrangements.p1).toEqual(draft)
    expect(result.p1InstantWin).toBe('three_flushes')
    expect(result.winner).toBe('p1')
  })
})
