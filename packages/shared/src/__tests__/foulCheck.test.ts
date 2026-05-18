import type { Card } from '../types'
import { describe, expect, it } from 'vitest'
import { quickFoulCheck } from '../foulCheck'

function card(rank: string, suit: string): Card {
  return {
    id: rank + suit,
    rank: rank as Card['rank'],
    suit: suit as Card['suit'],
  }
}

// Helper to build 5-card hands
const PAIR_HAND: Card[] = [
  card('A', 'S'),
  card('A', 'H'),
  card('K', 'D'),
  card('Q', 'C'),
  card('J', 'S'),
]
const TRIPS_HAND: Card[] = [
  card('5', 'S'),
  card('5', 'H'),
  card('5', 'D'),
  card('K', 'C'),
  card('2', 'S'),
]
const FLUSH_HAND: Card[] = [
  card('A', 'S'),
  card('K', 'S'),
  card('Q', 'S'),
  card('J', 'S'),
  card('9', 'S'),
]
const FOUR_OF_A_KIND: Card[] = [
  card('K', 'S'),
  card('K', 'H'),
  card('K', 'D'),
  card('K', 'C'),
  card('5', 'S'),
]
const FULL_HOUSE: Card[] = [
  card('Q', 'S'),
  card('Q', 'H'),
  card('Q', 'D'),
  card('9', 'S'),
  card('9', 'H'),
]

describe('quickFoulCheck', () => {
  it('returns true when back (group1) is clearly higher category', () => {
    expect(quickFoulCheck(TRIPS_HAND, PAIR_HAND)).toBe(true)
  })

  it('returns false when middle (group2) is clearly higher category', () => {
    expect(quickFoulCheck(PAIR_HAND, FLUSH_HAND)).toBe(false)
  })

  it('returns true when both same category (inconclusive — server decides)', () => {
    const pair1: Card[] = [
      card('A', 'S'),
      card('A', 'H'),
      card('K', 'D'),
      card('Q', 'C'),
      card('J', 'S'),
    ]
    const pair2: Card[] = [
      card('K', 'S'),
      card('K', 'H'),
      card('Q', 'D'),
      card('J', 'C'),
      card('T', 'S'),
    ]
    expect(quickFoulCheck(pair1, pair2)).toBe(true)
  })

  it('returns true when groups are incomplete (not enough cards to check)', () => {
    const partial = [card('A', 'S'), card('K', 'H'), card('Q', 'D')]
    expect(quickFoulCheck(partial, [card('2', 'S'), card('2', 'H')])).toBe(true)
  })

  it('detects four-of-a-kind vs full-house (back stronger → valid)', () => {
    expect(quickFoulCheck(FOUR_OF_A_KIND, FULL_HOUSE)).toBe(true)
  })
})
