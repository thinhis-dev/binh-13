import { describe, expect, it } from 'vitest'
import type { Card } from '../types'
import { compareThreeCard, evaluateThreeCard, RANK_VALUE } from '../evaluator'

function card(rank: string, suit: string): Card {
  return {
    id: rank + suit,
    rank: rank as Card['rank'],
    suit: suit as Card['suit'],
  }
}

describe('evaluateThreeCard', () => {
  it('detects Three of a Kind', () => {
    const result = evaluateThreeCard([
      card('7', 'S'),
      card('7', 'H'),
      card('7', 'D'),
    ])
    expect(result.category).toBe(2)
    expect(result.tiebreakers).toEqual([RANK_VALUE['7']])
  })

  it('detects One Pair', () => {
    const result = evaluateThreeCard([
      card('J', 'S'),
      card('J', 'H'),
      card('5', 'C'),
    ])
    expect(result.category).toBe(1)
    expect(result.tiebreakers).toEqual([RANK_VALUE['J'], RANK_VALUE['5']])
  })

  it('detects High Card', () => {
    const result = evaluateThreeCard([
      card('A', 'S'),
      card('K', 'H'),
      card('3', 'C'),
    ])
    expect(result.category).toBe(0)
    expect(result.tiebreakers).toEqual([
      RANK_VALUE['A'],
      RANK_VALUE['K'],
      RANK_VALUE['3'],
    ])
  })

  it('throws for wrong card count (too few)', () => {
    expect(() => evaluateThreeCard([card('A', 'S'), card('K', 'H')])).toThrow(
      '3 cards',
    )
  })

  it('throws for wrong card count (too many)', () => {
    expect(() =>
      evaluateThreeCard([
        card('A', 'S'),
        card('K', 'H'),
        card('Q', 'D'),
        card('J', 'C'),
      ]),
    ).toThrow('3 cards')
  })
})

describe('compareThreeCard', () => {
  it('Pair with higher kicker wins', () => {
    const a = evaluateThreeCard([
      card('Q', 'S'),
      card('Q', 'H'),
      card('A', 'C'),
    ])
    const b = evaluateThreeCard([
      card('Q', 'D'),
      card('Q', 'C'),
      card('2', 'S'),
    ])
    expect(compareThreeCard(a, b)).toBe(1)
  })

  it('Three of a Kind beats One Pair', () => {
    const a = evaluateThreeCard([
      card('3', 'S'),
      card('3', 'H'),
      card('3', 'D'),
    ])
    const b = evaluateThreeCard([
      card('A', 'S'),
      card('A', 'H'),
      card('K', 'C'),
    ])
    expect(compareThreeCard(a, b)).toBe(1)
  })

  it('Three of a Kind beats High Card', () => {
    const a = evaluateThreeCard([
      card('2', 'S'),
      card('2', 'H'),
      card('2', 'D'),
    ])
    const b = evaluateThreeCard([
      card('A', 'S'),
      card('K', 'H'),
      card('Q', 'C'),
    ])
    expect(compareThreeCard(a, b)).toBe(1)
  })

  it('One Pair beats High Card', () => {
    const a = evaluateThreeCard([
      card('2', 'S'),
      card('2', 'H'),
      card('3', 'C'),
    ])
    const b = evaluateThreeCard([
      card('A', 'S'),
      card('K', 'H'),
      card('Q', 'C'),
    ])
    expect(compareThreeCard(a, b)).toBe(1)
  })

  it('High Card tiebreaker — second card decides', () => {
    const a = evaluateThreeCard([
      card('A', 'S'),
      card('Q', 'H'),
      card('3', 'C'),
    ])
    const b = evaluateThreeCard([
      card('A', 'D'),
      card('J', 'H'),
      card('T', 'C'),
    ])
    expect(compareThreeCard(a, b)).toBe(1) // Q > J
  })

  it('High Card tiebreaker — third card decides', () => {
    const a = evaluateThreeCard([
      card('A', 'S'),
      card('K', 'H'),
      card('4', 'C'),
    ])
    const b = evaluateThreeCard([
      card('A', 'D'),
      card('K', 'C'),
      card('3', 'C'),
    ])
    expect(compareThreeCard(a, b)).toBe(1) // 4 > 3
  })

  it('Exact same ranks → draw', () => {
    const a = evaluateThreeCard([
      card('A', 'S'),
      card('K', 'H'),
      card('3', 'C'),
    ])
    const b = evaluateThreeCard([
      card('A', 'D'),
      card('K', 'C'),
      card('3', 'S'),
    ])
    expect(compareThreeCard(a, b)).toBe(0)
  })

  it('Identical trips → draw (suits irrelevant)', () => {
    const a = evaluateThreeCard([
      card('7', 'S'),
      card('7', 'H'),
      card('7', 'D'),
    ])
    const b = evaluateThreeCard([
      card('7', 'C'),
      card('7', 'S'),
      card('7', 'H'),
    ])
    expect(compareThreeCard(a, b)).toBe(0)
  })

  it('Pair tiebreak — same pair and same kicker → draw', () => {
    const a = evaluateThreeCard([
      card('J', 'S'),
      card('J', 'H'),
      card('5', 'C'),
    ])
    const b = evaluateThreeCard([
      card('J', 'D'),
      card('J', 'C'),
      card('5', 'S'),
    ])
    expect(compareThreeCard(a, b)).toBe(0)
  })

  it('b wins when b has a higher category', () => {
    const a = evaluateThreeCard([
      card('A', 'S'),
      card('K', 'H'),
      card('Q', 'C'),
    ])
    const b = evaluateThreeCard([
      card('2', 'S'),
      card('2', 'H'),
      card('3', 'C'),
    ])
    expect(compareThreeCard(a, b)).toBe(-1) // b has pair, a has high card
  })

  it('higher trips win over lower trips', () => {
    const a = evaluateThreeCard([
      card('A', 'S'),
      card('A', 'H'),
      card('A', 'D'),
    ])
    const b = evaluateThreeCard([
      card('2', 'S'),
      card('2', 'H'),
      card('2', 'D'),
    ])
    expect(compareThreeCard(a, b)).toBe(1)
  })

  it('higher pair wins over lower pair', () => {
    const a = evaluateThreeCard([
      card('A', 'S'),
      card('A', 'H'),
      card('2', 'C'),
    ])
    const b = evaluateThreeCard([
      card('K', 'S'),
      card('K', 'H'),
      card('Q', 'C'),
    ])
    expect(compareThreeCard(a, b)).toBe(1)
  })
})
