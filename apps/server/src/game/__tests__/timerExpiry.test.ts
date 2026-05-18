import type { Card, PlayerArrangement } from '@binh-13/shared'
import type { Server } from 'socket.io'
import { EVENTS } from '@binh-13/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleTimerExpiry } from '../gameEvents'
import { endGame, getGame, startGame, submitArrangement } from '../gameManager'

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

// ─── Mock DB and dependencies ────────────────────────────────────────────────

vi.mock('../../db', () => ({
  getDb: () => ({
    prepare: () => ({ run: vi.fn() }),
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
})
