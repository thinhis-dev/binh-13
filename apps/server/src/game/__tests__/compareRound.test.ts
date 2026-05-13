import { describe, expect, it } from 'vitest'
import type { Card, PlayerArrangement } from '@binh-13/shared'
import { compareRound } from '../compareRound'

function card(rank: string, suit: string): Card {
  return {
    id: rank + suit,
    rank: rank as Card['rank'],
    suit: suit as Card['suit'],
  }
}

function arr(
  playerId: number,
  back: string[],
  middle: string[],
  front: string[],
): PlayerArrangement {
  return {
    playerId,
    group1: back.map((s) => card(s[0], s[1])) as PlayerArrangement['group1'],
    group2: middle.map((s) => card(s[0], s[1])) as PlayerArrangement['group2'],
    group3: front.map((s) => card(s[0], s[1])) as PlayerArrangement['group3'],
  }
}

// Valid arrangements (no fouls)
const P1_STRONG = arr(
  1,
  ['AS', 'KS', 'QS', 'JS', 'TS'], // Royal Flush (back)
  ['9H', '8H', '7H', '6H', '5H'], // Straight Flush (middle)
  ['7S', '7H', '2C'], // One Pair (front)
)

const P2_WEAK = arr(
  2,
  ['AS', 'AH', 'KS', 'KH', 'QC'], // Two Pair (back)
  ['2S', '3H', '4D', '6C', '8S'], // High Card (middle)
  ['3S', '4H', '5C'], // High Card (front)
)

const P2_STRONG = arr(
  2,
  ['AS', 'KS', 'QS', 'JS', 'TS'], // Royal Flush
  ['9H', '8H', '7H', '6H', '5H'], // Straight Flush
  ['7S', '7H', '2C'], // One Pair
)

const P1_WEAK = arr(
  1,
  ['AS', 'AH', 'KS', 'KH', 'QC'], // Two Pair
  ['2S', '3H', '4D', '6C', '8S'], // High Card
  ['3S', '4H', '5C'], // High Card
)

// Foul arrangements (back < middle)
const P1_FOUL = arr(
  1,
  ['AS', 'AH', 'KD', 'QC', 'JS'], // One Pair (back — weaker)
  ['7S', '7H', '7D', '2S', '2H'], // Full House (middle — stronger → foul)
  ['3S', '4H', '5C'],
)

const P2_FOUL = arr(
  2,
  ['AS', 'AH', 'KD', 'QC', 'JS'], // One Pair (back — weaker)
  ['7S', '7H', '7D', '2S', '2H'], // Full House (middle — stronger → foul)
  ['3S', '4H', '5C'],
)

describe('compareRound', () => {
  it('P1 wins all 3 groups', () => {
    const result = compareRound(P1_STRONG, P2_WEAK)
    expect(result.winner).toBe('p1')
    expect(result.p1Score).toBe(3)
    expect(result.p2Score).toBe(0)
    expect(result.group1.result).toBe('p1')
    expect(result.group2.result).toBe('p1')
    expect(result.group3.result).toBe('p1')
  })

  it('P2 wins all 3 groups', () => {
    const result = compareRound(P1_WEAK, P2_STRONG)
    expect(result.winner).toBe('p2')
    expect(result.p1Score).toBe(0)
    expect(result.p2Score).toBe(3)
  })

  it('P1 wins 2, P2 wins 1 (mixed results)', () => {
    // P1 strong back, P2 stronger middle and front
    const p1 = arr(
      1,
      ['AS', 'KS', 'QS', 'JS', 'TS'], // Royal Flush (back) — P1 wins g1
      ['2S', '3H', '4D', '6C', '8S'], // High Card (middle) — P2 wins g2
      ['7S', '7H', '2C'], // One Pair (front) — P1 wins g3
    )
    const p2 = arr(
      2,
      ['9H', '8H', '7H', '6H', '5H'], // Straight Flush (back) — P1 still wins
      ['AS', 'AH', 'KS', 'KH', 'QC'], // Two Pair (middle) — P2 wins
      ['3S', '4H', '5C'], // High Card (front) — P1 pair wins
    )
    const result = compareRound(p1, p2)
    expect(result.winner).toBe('p1')
    expect(result.p1Score).toBe(2)
    expect(result.p2Score).toBe(1)
  })

  it('All 3 groups draw → winner is draw', () => {
    const identical1 = arr(
      1,
      ['AS', 'AH', 'KD', 'QC', 'JS'],
      ['2S', '3H', '4D', '6C', '8S'],
      ['7S', '7H', '2C'],
    )
    const identical2 = arr(
      2,
      ['AD', 'AC', 'KH', 'QS', 'JD'],
      ['2H', '3D', '4C', '6H', '8H'],
      ['7D', '7C', '2H'],
    )
    const result = compareRound(identical1, identical2)
    expect(result.winner).toBe('draw')
    expect(result.p1Score).toBe(0)
    expect(result.p2Score).toBe(0)
  })

  it('P1 fouls → P2 wins all', () => {
    const result = compareRound(P1_FOUL, P2_WEAK)
    expect(result.winner).toBe('p2')
    expect(result.p1Foul).toBe(true)
    expect(result.p2Foul).toBe(false)
    expect(result.p2Score).toBe(3)
    expect(result.p1Score).toBe(0)
    expect(result.group1.result).toBe('p2')
    expect(result.group2.result).toBe('p2')
    expect(result.group3.result).toBe('p2')
  })

  it('P2 fouls → P1 wins all', () => {
    const result = compareRound(P1_WEAK, P2_FOUL)
    expect(result.winner).toBe('p1')
    expect(result.p2Foul).toBe(true)
    expect(result.p1Foul).toBe(false)
    expect(result.p1Score).toBe(3)
    expect(result.p2Score).toBe(0)
  })

  it('Both foul → draw', () => {
    const result = compareRound(P1_FOUL, P2_FOUL)
    expect(result.winner).toBe('draw')
    expect(result.p1Foul).toBe(true)
    expect(result.p2Foul).toBe(true)
    expect(result.p1Score).toBe(0)
    expect(result.p2Score).toBe(0)
  })

  it('group3 uses 3-card evaluation (trips beats pair)', () => {
    const p1 = arr(
      1,
      ['AS', 'KS', 'QS', 'JS', 'TS'],
      ['9H', '8H', '7H', '6H', '5H'],
      ['7S', '7H', '7D'], // Three of a Kind
    )
    const p2 = arr(
      2,
      ['9H', '8H', '7H', '6H', '5H'],
      ['2S', '3H', '4D', '6C', '8S'],
      ['AS', 'AH', '2C'], // One Pair
    )
    const result = compareRound(p1, p2)
    expect(result.group3.result).toBe('p1') // trips beat pair
  })

  it('hand descriptions are populated in result', () => {
    const result = compareRound(P1_STRONG, P2_WEAK)
    expect(result.group1.p1Hand).toBeTruthy()
    expect(result.group1.p2Hand).toBeTruthy()
    expect(result.group3.p1Hand).toBe('One Pair')
    expect(result.group3.p2Hand).toBe('High Card')
  })

  it('arrangements are included in result', () => {
    const result = compareRound(P1_STRONG, P2_WEAK)
    expect(result.arrangements.p1).toBe(P1_STRONG)
    expect(result.arrangements.p2).toBe(P2_WEAK)
  })

  it('P1 wins 2, 1 draw — winner is p1', () => {
    // P1 back wins, P2 middle wins, front p1 wins → 2-1 p1
    const p1 = arr(
      1,
      ['AC', 'KC', 'QC', 'JC', 'TC'], // Royal Flush — P1 wins g1
      ['2S', '3H', '4D', '6C', '8S'], // High Card — P2 wins g2
      ['AH', 'AD', '2C'], // One Pair — P1 wins g3
    )
    const p2 = arr(
      2,
      ['9H', '8H', '7H', '6H', '5H'], // Straight Flush — P1 wins g1
      ['KS', 'KH', 'QS', 'QH', 'JC'], // Two Pair — P2 wins g2
      ['3S', '4D', '5C'], // High Card — P1 wins g3
    )
    const result = compareRound(p1, p2)
    expect(result.winner).toBe('p1')
    expect(result.p1Score).toBe(2)
    expect(result.p2Score).toBe(1)
  })
})
