import { describe, expect, it } from 'vitest'
import type { Card } from '@binh-13/shared'
import {
  compareFiveCard,
  describeFiveCard,
  evaluateFiveCard,
  toPokersolverFormat,
} from '../evaluator'

function card(rank: string, suit: string): Card {
  return {
    id: rank + suit,
    rank: rank as Card['rank'],
    suit: suit as Card['suit'],
  }
}

function hand(...specs: string[]): Card[] {
  return specs.map((s) => card(s[0], s[1]))
}

describe('toPokersolverFormat', () => {
  it('converts AS → As', () => {
    expect(toPokersolverFormat(card('A', 'S'))).toBe('As')
  })

  it('converts TH → Th', () => {
    expect(toPokersolverFormat(card('T', 'H'))).toBe('Th')
  })

  it('converts 2C → 2c', () => {
    expect(toPokersolverFormat(card('2', 'C'))).toBe('2c')
  })
})

describe('evaluateFiveCard', () => {
  it('throws for wrong card count', () => {
    expect(() => evaluateFiveCard(hand('AS', 'KS', 'QS', 'JS'))).toThrow(
      '5 cards',
    )
  })

  it('evaluates a Royal Flush', () => {
    const h = evaluateFiveCard(hand('AS', 'KS', 'QS', 'JS', 'TS'))
    expect(h.descr).toBe('Royal Flush')
  })
})

describe('describeFiveCard', () => {
  it('returns human-readable description for Royal Flush', () => {
    expect(describeFiveCard(hand('AS', 'KS', 'QS', 'JS', 'TS'))).toBe(
      'Royal Flush',
    )
  })
})

describe('compareFiveCard', () => {
  it('Royal Flush beats Straight Flush', () => {
    const a = hand('AS', 'KS', 'QS', 'JS', 'TS')
    const b = hand('9H', '8H', '7H', '6H', '5H')
    expect(compareFiveCard(a, b)).toBe(1)
  })

  it('Four of a Kind beats Full House', () => {
    const a = hand('KS', 'KH', 'KD', 'KC', '5S')
    const b = hand('QS', 'QH', 'QD', '9S', '9H')
    expect(compareFiveCard(a, b)).toBe(1)
  })

  it('Flush beats Straight', () => {
    const a = hand('AS', 'JS', '8S', '5S', '2S')
    const b = hand('8H', '7D', '6C', '5S', '4H')
    expect(compareFiveCard(a, b)).toBe(1)
  })

  it('Two Pair beats One Pair', () => {
    const a = hand('AS', 'AH', 'KS', 'KH', '5C')
    const b = hand('TS', 'TH', 'AC', 'KD', '2S')
    expect(compareFiveCard(a, b)).toBe(1)
  })

  it('Higher pair wins', () => {
    const a = hand('AS', 'AH', '3D', '5C', '7S')
    const b = hand('KS', 'KH', 'QD', 'JC', 'TS')
    expect(compareFiveCard(a, b)).toBe(1)
  })

  it('Same pair, higher kicker wins', () => {
    const a = hand('AS', 'AH', 'KD', '5C', '3S')
    const b = hand('AD', 'AC', 'QD', 'JC', 'TS')
    expect(compareFiveCard(a, b)).toBe(1) // K kicker beats Q
  })

  it('Identical hands → draw', () => {
    const a = hand('AS', 'KH', 'QD', 'JC', '9S')
    const b = hand('AD', 'KC', 'QS', 'JH', '9D')
    expect(compareFiveCard(a, b)).toBe(0)
  })

  it('Full House beats Flush', () => {
    const a = hand('7S', '7H', '7D', '2S', '2H')
    const b = hand('AS', 'KS', 'QS', 'JS', '9S')
    expect(compareFiveCard(a, b)).toBe(1)
  })

  it('Straight A-high beats Straight K-high', () => {
    const a = hand('AS', 'KH', 'QD', 'JC', 'TS')
    const b = hand('KS', 'QH', 'JD', 'TC', '9S')
    expect(compareFiveCard(a, b)).toBe(1)
  })

  it('Three of a Kind beats Two Pair', () => {
    const a = hand('5S', '5H', '5D', 'KC', '2S')
    const b = hand('AS', 'AH', 'KS', 'KH', 'QC')
    expect(compareFiveCard(a, b)).toBe(1)
  })

  it('b wins returns -1', () => {
    const a = hand('2S', '3H', '4D', '6C', '8S') // high card
    const b = hand('AS', 'AH', '2D', '3C', '4S') // one pair
    expect(compareFiveCard(a, b)).toBe(-1)
  })
})
