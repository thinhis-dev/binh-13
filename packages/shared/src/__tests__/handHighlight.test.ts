import type { Card } from '../types'
import { describe, expect, it } from 'vitest'
import { getHighlightedCardIds } from '../handHighlight'

function card(rank: string, suit: string): Card {
  return {
    id: rank + suit,
    rank: rank as Card['rank'],
    suit: suit as Card['suit'],
  }
}

// ─── 5-card highlights ───────────────────────────────────────────────────────

describe('getHighlightedCardIds — 5-card hands', () => {
  it('highlights all 5 cards for a Royal Flush', () => {
    const cards = [
      card('A', 'S'),
      card('K', 'S'),
      card('Q', 'S'),
      card('J', 'S'),
      card('T', 'S'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['AS', 'KS', 'QS', 'JS', 'TS']))
  })

  it('highlights all 5 cards for a Straight Flush', () => {
    const cards = [
      card('9', 'H'),
      card('8', 'H'),
      card('7', 'H'),
      card('6', 'H'),
      card('5', 'H'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['9H', '8H', '7H', '6H', '5H']))
  })

  it('highlights 4 cards for Four of a Kind', () => {
    const cards = [
      card('7', 'S'),
      card('7', 'H'),
      card('7', 'D'),
      card('7', 'C'),
      card('2', 'S'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['7S', '7H', '7D', '7C']))
  })

  it('highlights all 5 cards for a Full House', () => {
    const cards = [
      card('Q', 'S'),
      card('Q', 'H'),
      card('Q', 'D'),
      card('9', 'S'),
      card('9', 'H'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['QS', 'QH', 'QD', '9S', '9H']))
  })

  it('highlights all 5 cards for a Flush', () => {
    const cards = [
      card('A', 'S'),
      card('T', 'S'),
      card('7', 'S'),
      card('4', 'S'),
      card('2', 'S'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['AS', 'TS', '7S', '4S', '2S']))
  })

  it('highlights all 5 cards for a Straight', () => {
    const cards = [
      card('9', 'H'),
      card('8', 'S'),
      card('7', 'D'),
      card('6', 'C'),
      card('5', 'H'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['9H', '8S', '7D', '6C', '5H']))
  })

  it('highlights 3 cards for Three of a Kind', () => {
    const cards = [
      card('5', 'S'),
      card('5', 'H'),
      card('5', 'D'),
      card('K', 'S'),
      card('2', 'C'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['5S', '5H', '5D']))
  })

  it('highlights 4 cards for Two Pair', () => {
    const cards = [
      card('K', 'S'),
      card('K', 'H'),
      card('4', 'D'),
      card('4', 'C'),
      card('2', 'S'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['KS', 'KH', '4D', '4C']))
  })

  it('highlights 2 cards for One Pair', () => {
    const cards = [
      card('A', 'S'),
      card('A', 'H'),
      card('9', 'D'),
      card('6', 'C'),
      card('3', 'S'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['AS', 'AH']))
  })

  it('highlights 1 card (highest) for High Card', () => {
    const cards = [
      card('A', 'S'),
      card('K', 'D'),
      card('9', 'H'),
      card('6', 'C'),
      card('3', 'S'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['AS']))
  })

  it('throws error when given 4 cards', () => {
    const cards = [
      card('A', 'S'),
      card('K', 'D'),
      card('Q', 'H'),
      card('J', 'C'),
    ]
    expect(() => getHighlightedCardIds(cards)).toThrow()
  })

  it('throws error when given 6 cards', () => {
    const cards = [
      card('A', 'S'),
      card('K', 'D'),
      card('Q', 'H'),
      card('J', 'C'),
      card('T', 'S'),
      card('9', 'H'),
    ]
    expect(() => getHighlightedCardIds(cards)).toThrow()
  })
})

// ─── 3-card highlights ───────────────────────────────────────────────────────

describe('getHighlightedCardIds — 3-card hands', () => {
  it('highlights all 3 cards for Three of a Kind', () => {
    const cards = [card('7', 'S'), card('7', 'H'), card('7', 'D')]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['7S', '7H', '7D']))
  })

  it('highlights 2 cards for One Pair', () => {
    const cards = [card('K', 'S'), card('K', 'H'), card('3', 'D')]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['KS', 'KH']))
  })

  it('highlights 1 card (highest) for High Card', () => {
    const cards = [card('A', 'H'), card('9', 'D'), card('4', 'C')]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['AH']))
  })

  it('throws error for 2 cards', () => {
    const cards = [card('A', 'S'), card('K', 'H')]
    expect(() => getHighlightedCardIds(cards)).toThrow()
  })

  it('throws error for 4 cards', () => {
    const cards = [
      card('A', 'S'),
      card('K', 'H'),
      card('Q', 'D'),
      card('J', 'C'),
    ]
    expect(() => getHighlightedCardIds(cards)).toThrow()
  })
})

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('getHighlightedCardIds — edge cases', () => {
  it('four of a Kind with ace kicker — only 4 highlighted', () => {
    const cards = [
      card('A', 'S'),
      card('A', 'H'),
      card('A', 'D'),
      card('A', 'C'),
      card('K', 'S'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['AS', 'AH', 'AD', 'AC']))
    expect(result.has('KS')).toBe(false)
  })

  it('two Pair with high kicker — kicker not highlighted', () => {
    const cards = [
      card('A', 'S'),
      card('A', 'H'),
      card('K', 'S'),
      card('K', 'H'),
      card('Q', 'D'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['AS', 'AH', 'KS', 'KH']))
    expect(result.has('QD')).toBe(false)
  })

  it('pair of twos — lowest pair still highlights 2 cards', () => {
    const cards = [
      card('2', 'S'),
      card('2', 'H'),
      card('A', 'H'),
      card('K', 'D'),
      card('Q', 'C'),
    ]
    const result = getHighlightedCardIds(cards)
    expect(result).toEqual(new Set(['2S', '2H']))
  })
})
