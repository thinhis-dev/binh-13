import { describe, expect, it } from 'vitest'
import type { Card, PlayerArrangement } from '@binh-13/shared'
import { validateSubmittedCards, createForfeitArrangement } from '../gameEvents'
import { validateArrangement } from '../foulCheck'

// ─── Test data helpers ───────────────────────────────────────────────────────

const RANKS: Card['rank'][] = [
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
const SUITS: Card['suit'][] = ['S', 'H', 'D', 'C']

function makeCard(rank: Card['rank'], suit: Card['suit']): Card {
  return { id: `${rank}${suit}`, rank, suit }
}

/** Creates a deterministic 13-card hand for testing. */
function makeHand(): Card[] {
  return [
    makeCard('A', 'S'),
    makeCard('K', 'S'),
    makeCard('Q', 'S'),
    makeCard('J', 'S'),
    makeCard('T', 'S'),
    makeCard('9', 'H'),
    makeCard('8', 'H'),
    makeCard('7', 'H'),
    makeCard('6', 'H'),
    makeCard('5', 'H'),
    makeCard('4', 'D'),
    makeCard('3', 'D'),
    makeCard('2', 'D'),
  ]
}

function makeArrangement(hand: Card[]): {
  group1: Card[]
  group2: Card[]
  group3: Card[]
} {
  return {
    group1: hand.slice(0, 5),
    group2: hand.slice(5, 10),
    group3: hand.slice(10, 13),
  }
}

// ─── validateSubmittedCards ──────────────────────────────────────────────────

describe('validateSubmittedCards', () => {
  it('accepts valid arrangement with all dealt cards', () => {
    const hand = makeHand()
    const arr = makeArrangement(hand)
    expect(validateSubmittedCards(hand, arr)).toBe(true)
  })

  it('accepts cards in different order than dealt', () => {
    const hand = makeHand()
    const shuffled = [...hand].reverse()
    const arr = makeArrangement(shuffled)
    expect(validateSubmittedCards(hand, arr)).toBe(true)
  })

  it('rejects when a card not in the dealt hand is included', () => {
    const hand = makeHand()
    const foreign = makeCard('A', 'C') // not in hand
    const arr = {
      group1: [foreign, ...hand.slice(1, 5)],
      group2: hand.slice(5, 10),
      group3: hand.slice(10, 13),
    }
    expect(validateSubmittedCards(hand, arr)).toBe(false)
  })

  it('rejects when cards are duplicated', () => {
    const hand = makeHand()
    const dup = hand[0]
    const arr = {
      group1: [dup, dup, dup, dup, dup],
      group2: [dup, dup, dup, dup, dup],
      group3: [dup, dup, dup],
    }
    expect(validateSubmittedCards(hand, arr)).toBe(false)
  })

  it('rejects when total card count is wrong (too few)', () => {
    const hand = makeHand()
    const arr = {
      group1: hand.slice(0, 5),
      group2: hand.slice(5, 10),
      group3: hand.slice(10, 12), // only 2 cards instead of 3
    }
    // This should fail because the arrangement wrapper has already validated
    // via Zod, but validateSubmittedCards checks total = 13
    expect(validateSubmittedCards(hand, arr as any)).toBe(false)
  })

  it('rejects when all cards are foreign', () => {
    const hand = makeHand()
    const foreign = Array.from({ length: 13 }, (_, i) =>
      makeCard(RANKS[i % 13], 'C'),
    )
    // Some may overlap with hand by chance, use a completely different set
    const fakeSuit: Card['suit'] = 'C'
    const fakeCards: Card[] = [
      makeCard('2', fakeSuit),
      makeCard('3', fakeSuit),
      makeCard('4', fakeSuit),
      makeCard('5', fakeSuit),
      makeCard('6', fakeSuit),
      makeCard('7', fakeSuit),
      makeCard('8', fakeSuit),
      makeCard('9', fakeSuit),
      makeCard('T', fakeSuit),
      makeCard('J', fakeSuit),
      makeCard('Q', fakeSuit),
      makeCard('K', fakeSuit),
      makeCard('A', fakeSuit),
    ]
    const arr = makeArrangement(fakeCards)
    expect(validateSubmittedCards(hand, arr)).toBe(false)
  })
})

// ─── createForfeitArrangement ────────────────────────────────────────────────

describe('createForfeitArrangement', () => {
  it('returns an arrangement with all 13 cards from the dealt hand', () => {
    const hand = makeHand()
    const result = createForfeitArrangement(1, hand)
    const allCards = [...result.group1, ...result.group2, ...result.group3]
    expect(allCards).toHaveLength(13)

    const resultIds = new Set(allCards.map((c) => c.id))
    const handIds = new Set(hand.map((c) => c.id))
    expect(resultIds).toEqual(handIds)
  })

  it('sets the correct playerId', () => {
    const hand = makeHand()
    const result = createForfeitArrangement(42, hand)
    expect(result.playerId).toBe(42)
  })

  it('produces a foul arrangement (group1 weaker than group2)', () => {
    const hand = makeHand()
    const result = createForfeitArrangement(1, hand)
    // validateArrangement returns true if NOT foul, false if foul
    const isValid = validateArrangement(result)
    expect(isValid).toBe(false)
  })

  it('produces correct group sizes (5, 5, 3)', () => {
    const hand = makeHand()
    const result = createForfeitArrangement(1, hand)
    expect(result.group1).toHaveLength(5)
    expect(result.group2).toHaveLength(5)
    expect(result.group3).toHaveLength(3)
  })

  it('works with a random 13-card hand', () => {
    // Build a different hand to ensure it's not dependent on specific cards
    const hand: Card[] = [
      makeCard('2', 'S'),
      makeCard('4', 'H'),
      makeCard('6', 'D'),
      makeCard('8', 'C'),
      makeCard('T', 'S'),
      makeCard('Q', 'H'),
      makeCard('A', 'D'),
      makeCard('3', 'C'),
      makeCard('5', 'S'),
      makeCard('7', 'H'),
      makeCard('9', 'D'),
      makeCard('J', 'C'),
      makeCard('K', 'S'),
    ]
    const result = createForfeitArrangement(99, hand)
    expect(result.group1).toHaveLength(5)
    expect(result.group2).toHaveLength(5)
    expect(result.group3).toHaveLength(3)
    // Should foul
    const isValid = validateArrangement(result)
    expect(isValid).toBe(false)
  })
})
