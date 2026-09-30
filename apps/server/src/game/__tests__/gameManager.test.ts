import type { Card, PlayerArrangement } from '@binh-13/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { autoArrange } from '../autoArrange'
import {
  allSubmitted,
  arrangementAtTimeout,
  endGame,
  getAutoArrangement,
  getGame,
  getPlayerIds,
  saveDraft,
  startGame,
  submitArrangement,
} from '../gameManager'

vi.mock('../autoArrange', async importOriginal => ({
  autoArrange: vi.fn((await importOriginal<typeof import('../autoArrange')>()).autoArrange),
}))

const FIXED_HAND = 'AS AH AD 9C 9S KS KH 7D 6C 2D QS QH 3C'.split(' ').map(id => ({
  id,
  rank: id[0] as Card['rank'],
  suit: id[1] as Card['suit'],
}))

/** Starts a game in which player 1 holds FIXED_HAND. */
function startFixedGame() {
  const game = startGame('TESTAA', [1, 2])
  game.hands.set(1, FIXED_HAND)
  return game
}

/** A valid board that differs from the auto-arrangement: Back in reverse order. */
function validDraft(): PlayerArrangement {
  const auto = autoArrange(1, FIXED_HAND)
  return { ...auto, group1: [...auto.group1].reverse() as PlayerArrangement['group1'] }
}

/** Back and Middle of the auto-arrangement swapped: Middle is stronger, so it fouls. */
function foulDraft(): PlayerArrangement {
  const auto = autoArrange(1, FIXED_HAND)
  return { ...auto, group1: auto.group2 as PlayerArrangement['group1'], group2: auto.group1 as PlayerArrangement['group2'] }
}

function makeDummyArrangement(playerId: number): PlayerArrangement {
  // Minimal arrangement for testing — real card validation is in gameEvents
  return {
    playerId,
    group1: [] as unknown as PlayerArrangement['group1'],
    group2: [] as unknown as PlayerArrangement['group2'],
    group3: [] as unknown as PlayerArrangement['group3'],
  }
}

describe('gameManager', () => {
  const ROOM = 'TESTAA'

  afterEach(() => {
    // Clean up any leftover game instances
    endGame(ROOM)
    endGame('TESTBB')
  })

  describe('startGame', () => {
    it('creates a game instance with 13 cards per player', () => {
      const game = startGame(ROOM, [1, 2])
      expect(game.status).toBe('arranging')
      expect(game.roomCode).toBe(ROOM)
      expect(game.hands.get(1)).toHaveLength(13)
      expect(game.hands.get(2)).toHaveLength(13)
      expect(game.submissions.size).toBe(0)
      expect(game.timerSeconds).toBe(60)
    })

    it('uses custom timer seconds', () => {
      const game = startGame(ROOM, [1, 2], 30)
      expect(game.timerSeconds).toBe(30)
    })

    it('deals unique cards (no overlap between players)', () => {
      const game = startGame(ROOM, [1, 2])
      const p1Ids = new Set(game.hands.get(1)!.map(c => c.id))
      const p2Cards = game.hands.get(2)!
      for (const card of p2Cards) {
        expect(p1Ids.has(card.id)).toBe(false)
      }
    })

    it('is retrievable via getGame', () => {
      startGame(ROOM, [1, 2])
      const game = getGame(ROOM)
      expect(game).toBeDefined()
      expect(game!.roomCode).toBe(ROOM)
    })
  })

  describe('getGame', () => {
    it('returns undefined for non-existent game', () => {
      expect(getGame('NOROOM')).toBeUndefined()
    })
  })

  describe('submitArrangement', () => {
    it('accepts first submission', () => {
      startGame(ROOM, [1, 2])
      const result = submitArrangement(ROOM, 1, makeDummyArrangement(1))
      expect(result).toBe(true)
    })

    it('rejects duplicate submission from same player', () => {
      startGame(ROOM, [1, 2])
      submitArrangement(ROOM, 1, makeDummyArrangement(1))
      const result = submitArrangement(ROOM, 1, makeDummyArrangement(1))
      expect(result).toBe(false)
    })

    it('rejects submission for non-existent game', () => {
      const result = submitArrangement('NOROOM', 1, makeDummyArrangement(1))
      expect(result).toBe(false)
    })

    it('rejects submission when game is not in arranging status', () => {
      const game = startGame(ROOM, [1, 2])
      game.status = 'finished'
      const result = submitArrangement(ROOM, 1, makeDummyArrangement(1))
      expect(result).toBe(false)
    })
  })

  describe('allSubmitted', () => {
    it('returns false when no submissions', () => {
      startGame(ROOM, [1, 2])
      expect(allSubmitted(ROOM)).toBe(false)
    })

    it('returns false when only one player submitted', () => {
      startGame(ROOM, [1, 2])
      submitArrangement(ROOM, 1, makeDummyArrangement(1))
      expect(allSubmitted(ROOM)).toBe(false)
    })

    it('returns true when both players submitted', () => {
      startGame(ROOM, [1, 2])
      submitArrangement(ROOM, 1, makeDummyArrangement(1))
      submitArrangement(ROOM, 2, makeDummyArrangement(2))
      expect(allSubmitted(ROOM)).toBe(true)
    })

    it('returns false for non-existent game', () => {
      expect(allSubmitted('NOROOM')).toBe(false)
    })
  })

  describe('endGame', () => {
    it('removes game from memory', () => {
      startGame(ROOM, [1, 2])
      expect(getGame(ROOM)).toBeDefined()
      endGame(ROOM)
      expect(getGame(ROOM)).toBeUndefined()
    })

    it('clears the timer handle', () => {
      const game = startGame(ROOM, [1, 2])
      const clearSpy = vi.spyOn(globalThis, 'clearInterval')
      game.timerHandle = setInterval(() => {}, 1000)
      endGame(ROOM)
      expect(clearSpy).toHaveBeenCalled()
      clearSpy.mockRestore()
    })

    it('is a no-op for non-existent game', () => {
      // Should not throw
      expect(() => endGame('NOROOM')).not.toThrow()
    })
  })

  describe('getPlayerIds', () => {
    it('returns player IDs in insertion order', () => {
      startGame(ROOM, [42, 99])
      const ids = getPlayerIds(ROOM)
      expect(ids).toEqual([42, 99])
    })

    it('returns undefined for non-existent game', () => {
      expect(getPlayerIds('NOROOM')).toBeUndefined()
    })
  })

  describe('saveDraft', () => {
    it('stores the latest draft of a player who did not submit', () => {
      startFixedGame()

      expect(saveDraft(ROOM, 1, foulDraft())).toBe(true)
      expect(saveDraft(ROOM, 1, validDraft())).toBe(true)
      expect(getGame(ROOM)!.drafts.get(1)).toEqual(validDraft())
    })

    it('rejects a draft after submit, or without a game in progress', () => {
      startFixedGame()
      submitArrangement(ROOM, 1, validDraft())

      expect(saveDraft(ROOM, 1, foulDraft())).toBe(false)
      expect(getGame(ROOM)!.drafts.has(1)).toBe(false)
      expect(saveDraft('NOROOM', 1, validDraft())).toBe(false)
    })
  })

  describe('getAutoArrangement', () => {
    it('computes the auto-arrangement once for each player and caches it', () => {
      startFixedGame()
      vi.mocked(autoArrange).mockClear()

      const first = getAutoArrangement(ROOM, 1)
      const second = getAutoArrangement(ROOM, 1)

      expect(second).toBe(first)
      expect(autoArrange).toHaveBeenCalledTimes(1)
      expect(getAutoArrangement('NOROOM', 1)).toBeUndefined()
    })
  })

  describe('arrangementAtTimeout', () => {
    it('uses the submission first', () => {
      startFixedGame()
      saveDraft(ROOM, 1, foulDraft())
      submitArrangement(ROOM, 1, validDraft())

      expect(arrangementAtTimeout(ROOM, 1)).toEqual(validDraft())
    })

    it('uses a valid draft', () => {
      startFixedGame()
      saveDraft(ROOM, 1, validDraft())

      expect(arrangementAtTimeout(ROOM, 1)).toEqual(validDraft())
    })

    it('uses the auto-arrangement for a foul draft', () => {
      startFixedGame()
      saveDraft(ROOM, 1, foulDraft())

      expect(arrangementAtTimeout(ROOM, 1)).toEqual(autoArrange(1, FIXED_HAND))
    })

    it('uses the auto-arrangement without a draft', () => {
      startFixedGame()

      expect(arrangementAtTimeout(ROOM, 1)).toEqual(autoArrange(1, FIXED_HAND))
    })
  })
})
