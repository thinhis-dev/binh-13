import type { Card } from '@binh-13/shared'
import { describe, expect, it } from 'vitest'
import { autoArrange } from '../autoArrange'
import { createDeck } from '../engine'
import { describeFiveCard } from '../evaluator'
import { validateArrangement } from '../foulCheck'

/** Small seeded PRNG (mulberry32), so the random hands are the same on every run. */
function seededRandom(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededHand(seed: number): Card[] {
  const random = seededRandom(seed)
  const deck = createDeck()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck.slice(0, 13)
}

function hand(ids: string): Card[] {
  return ids.split(' ').map(id => ({
    id,
    rank: id[0] as Card['rank'],
    suit: id[1] as Card['suit'],
  }))
}

describe('autoArrange', () => {
  it('uses the 13 cards of the hand and never fouls, for 20 seeded random hands', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const cards = seededHand(seed)
      const arrangement = autoArrange(7, cards)

      expect(arrangement.playerId).toBe(7)
      expect(arrangement.group1).toHaveLength(5)
      expect(arrangement.group2).toHaveLength(5)
      expect(arrangement.group3).toHaveLength(3)
      const ids = [...arrangement.group1, ...arrangement.group2, ...arrangement.group3].map(c => c.id)
      expect(new Set(ids).size).toBe(13)
      expect([...ids].sort()).toEqual(cards.map(c => c.id).sort())
      expect(validateArrangement(arrangement)).toBe(true)
    }
  })

  it('puts four of a kind in Back', () => {
    const arrangement = autoArrange(1, hand('7S 7H 7D 7C KS QH 9D 5C 4S 3H 2D JC TH'))

    expect(describeFiveCard(arrangement.group1)).toMatch(/Four of a Kind/)
  })

  it('takes less than 100 ms for one hand', () => {
    // Measured for the plan's performance risk: report before optimizing if this fails.
    // It counts CPU time (process.cpuUsage), not wall-clock time, so that other test workers
    // that compete for the CPU do not decide the result. It takes one warm-up call, then the
    // median of 5 calls. A warm call takes about 20 ms on a dev machine.
    autoArrange(1, seededHand(98))
    const times = [99, 100, 101, 102, 103].map((seed) => {
      const cards = seededHand(seed)
      const start = process.cpuUsage()
      autoArrange(1, cards)
      const used = process.cpuUsage(start)
      return (used.user + used.system) / 1000
    })

    expect(times.sort((a, b) => a - b)[2]).toBeLessThan(100)
  })
})
