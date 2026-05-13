import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  allSubmitted,
  endGame,
  getGame,
  getPlayerIds,
  startGame,
  submitArrangement,
} from '../gameManager'
import type { PlayerArrangement } from '@binh-13/shared'

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
      const p1Ids = new Set(game.hands.get(1)!.map((c) => c.id))
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
})
