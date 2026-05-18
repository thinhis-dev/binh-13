import { describe, expect, it } from 'vitest'
import { createDeck, deal, shuffle } from '../engine'

describe('createDeck', () => {
  it('returns 52 cards', () => {
    expect(createDeck()).toHaveLength(52)
  })

  it('has no duplicate card ids', () => {
    const deck = createDeck()
    const ids = deck.map(c => c.id)
    expect(new Set(ids).size).toBe(52)
  })

  it('has 4 suits × 13 ranks', () => {
    const deck = createDeck()
    const suits = ['S', 'H', 'D', 'C']
    const ranks = [
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
    for (const suit of suits) {
      for (const rank of ranks) {
        expect(deck.some(c => c.rank === rank && c.suit === suit)).toBe(true)
      }
    }
  })

  it('each card id equals rank + suit', () => {
    const deck = createDeck()
    for (const card of deck) {
      expect(card.id).toBe(card.rank + card.suit)
    }
  })
})

describe('shuffle', () => {
  it('returns the same array reference (in-place)', () => {
    const arr = [1, 2, 3, 4, 5]
    expect(shuffle(arr)).toBe(arr)
  })

  it('preserves all elements', () => {
    const deck = createDeck()
    const original = deck.map(c => c.id)
    shuffle(deck)
    const shuffled = deck.map(c => c.id)
    expect(shuffled.sort()).toEqual(original.sort())
  })

  it('statistically produces different orders', () => {
    const original = createDeck()
      .map(c => c.id)
      .join(',')
    let different = 0
    for (let i = 0; i < 10; i++) {
      const deck = createDeck()
      shuffle(deck)
      if (deck.map(c => c.id).join(',') !== original)
        different++
    }
    // Expect at least 9 out of 10 shuffles to be different
    expect(different).toBeGreaterThanOrEqual(9)
  })
})

describe('deal', () => {
  it('deal(2) returns 2 hands of 13 cards each', () => {
    const hands = deal(2)
    expect(hands).toHaveLength(2)
    expect(hands[0]).toHaveLength(13)
    expect(hands[1]).toHaveLength(13)
  })

  it('deal(2) hands have no overlap', () => {
    const hands = deal(2)
    const ids0 = new Set(hands[0].map(c => c.id))
    const ids1 = new Set(hands[1].map(c => c.id))
    for (const id of ids1) {
      expect(ids0.has(id)).toBe(false)
    }
  })

  it('deal(2) uses exactly 26 unique cards', () => {
    const hands = deal(2)
    const all = [...hands[0], ...hands[1]]
    expect(new Set(all.map(c => c.id)).size).toBe(26)
  })

  it('deal(4) returns 4 hands of 13 cards each', () => {
    const hands = deal(4)
    expect(hands).toHaveLength(4)
    for (const hand of hands) {
      expect(hand).toHaveLength(13)
    }
  })

  it('deal(4) has no overlap across all hands', () => {
    const hands = deal(4)
    const all = hands.flat()
    expect(new Set(all.map(c => c.id)).size).toBe(52)
  })

  it('throws for playerCount < 2', () => {
    // @ts-expect-error testing invalid input
    expect(() => deal(1)).toThrow()
  })

  it('throws for playerCount > 4', () => {
    // @ts-expect-error testing invalid input
    expect(() => deal(5)).toThrow()
  })
})
