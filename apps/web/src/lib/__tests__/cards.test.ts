import { describe, expect, it } from 'vitest'
import type { Card } from '@binh-13/shared'
import {
  RANK_LABEL,
  RANK_VALUE,
  RED_SUITS,
  SUIT_LABEL,
  SUIT_SYMBOL,
  SUIT_VALUE,
  sortCards,
  toPokerSolver,
} from '../cards'

describe('card helpers', () => {
  it('exposes rank and suit metadata', () => {
    expect(SUIT_SYMBOL.S).toBe('♠')
    expect(SUIT_LABEL.H).toBe('Hearts')
    expect(RANK_VALUE.A).toBe(14)
    expect(RANK_LABEL.T).toBe('10')
    expect(RED_SUITS.has('D')).toBe(true)
    expect(RED_SUITS.has('S')).toBe(false)
  })

  it('converts card ids to pokersolver format', () => {
    expect(toPokerSolver('AS')).toBe('As')
    expect(toPokerSolver('TH')).toBe('Th')
  })
})

describe('SUIT_VALUE', () => {
  it('orders suits S > H > D > C (bridge convention)', () => {
    expect(SUIT_VALUE.S).toBeGreaterThan(SUIT_VALUE.H)
    expect(SUIT_VALUE.H).toBeGreaterThan(SUIT_VALUE.D)
    expect(SUIT_VALUE.D).toBeGreaterThan(SUIT_VALUE.C)
  })
})

describe('sortCards', () => {
  const c = (id: string): Card => ({
    id,
    rank: id[0] as Card['rank'],
    suit: id[1] as Card['suit'],
  })

  it('returns an empty array unchanged', () => {
    expect(sortCards([])).toEqual([])
  })

  it('returns a single-card array unchanged', () => {
    const cards = [c('AS')]
    expect(sortCards(cards)).toEqual([c('AS')])
  })

  it('sorts two cards of different ranks — higher rank first', () => {
    expect(sortCards([c('2H'), c('AH')])).toEqual([c('AH'), c('2H')])
  })

  it('sorts two cards of same rank by suit descending (S > D)', () => {
    expect(sortCards([c('AD'), c('AS')])).toEqual([c('AS'), c('AD')])
  })

  it('sorts all four suits of the same rank: S H D C', () => {
    const input = [c('2C'), c('2D'), c('2H'), c('2S')]
    const result = sortCards(input)
    expect(result.map((card) => card.id)).toEqual(['2S', '2H', '2D', '2C'])
  })

  it('sorts a full 13-card hand: A high → 2 low, suit as tiebreak', () => {
    const hand: Card[] = [
      c('2S'),
      c('5H'),
      c('9D'),
      c('KS'),
      c('AS'),
      c('3C'),
      c('7H'),
      c('TS'),
      c('JD'),
      c('QC'),
      c('4S'),
      c('6D'),
      c('8H'),
    ]
    const sorted = sortCards(hand)
    // First card must be the highest
    expect(sorted[0].rank).toBe('A')
    // Last card must be the lowest
    expect(sorted[sorted.length - 1].rank).toBe('2')
    // All ranks must be non-increasing
    for (let i = 1; i < sorted.length; i++) {
      expect(RANK_VALUE[sorted[i].rank]).toBeLessThanOrEqual(
        RANK_VALUE[sorted[i - 1].rank],
      )
    }
  })

  it('correctly orders face cards: A K Q J T', () => {
    const input = [c('TH'), c('JD'), c('QC'), c('KS'), c('AS')]
    const sorted = sortCards(input)
    expect(sorted.map((card) => card.rank)).toEqual(['A', 'K', 'Q', 'J', 'T'])
  })

  it('handles already-sorted input without changing order', () => {
    const input = [c('AS'), c('KS'), c('QS')]
    const sorted = sortCards(input)
    expect(sorted.map((card) => card.id)).toEqual(['AS', 'KS', 'QS'])
  })

  it('does not mutate the original array', () => {
    const original = [c('2H'), c('AH')]
    const copy = [...original]
    sortCards(original)
    expect(original).toEqual(copy)
  })
})
