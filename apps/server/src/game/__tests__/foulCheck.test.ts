import type { Card, PlayerArrangement } from '@binh-13/shared'
import { describe, expect, it } from 'vitest'
import { validateArrangement } from '../foulCheck'

function card(rank: string, suit: string): Card {
  return {
    id: rank + suit,
    rank: rank as Card['rank'],
    suit: suit as Card['suit'],
  }
}

function arrangement(
  back: string[],
  middle: string[],
  front: string[],
): PlayerArrangement {
  return {
    playerId: 1,
    group1: back.map(s => card(s[0], s[1])) as PlayerArrangement['group1'],
    group2: middle.map(s => card(s[0], s[1])) as PlayerArrangement['group2'],
    group3: front.map(s => card(s[0], s[1])) as PlayerArrangement['group3'],
  }
}

describe('validateArrangement', () => {
  it('back stronger than Middle → valid (Full House vs Two Pair)', () => {
    const arr = arrangement(
      ['7S', '7H', '7D', '2S', '2H'], // Full House
      ['AS', 'AH', 'KS', 'KH', 'QC'], // Two Pair
      ['3S', '4H', '5C'],
    )
    expect(validateArrangement(arr)).toBe(true)
  })

  it('back equal to Middle → valid (identical hands)', () => {
    const arr = arrangement(
      ['AS', 'AH', 'KD', 'QC', 'JS'], // One Pair AA
      ['AD', 'AC', 'KH', 'QS', 'JD'], // One Pair AA same kickers
      ['3S', '4H', '5C'],
    )
    expect(validateArrangement(arr)).toBe(true)
  })

  it('back weaker than Middle → foul (One Pair vs Full House)', () => {
    const arr = arrangement(
      ['AS', 'AH', 'KD', 'QC', 'JS'], // One Pair
      ['7S', '7H', '7D', '2S', '2H'], // Full House
      ['3S', '4H', '5C'],
    )
    expect(validateArrangement(arr)).toBe(false)
  })

  it('back High Card vs Middle Flush → foul', () => {
    const arr = arrangement(
      ['AS', 'KH', 'QD', 'JC', '9S'], // High Card
      ['2S', '4S', '6S', '8S', 'TS'], // Flush
      ['3H', '4H', '5C'],
    )
    expect(validateArrangement(arr)).toBe(false)
  })

  it('back wins on kicker → valid (Pair AA, K kicker vs Pair AA, Q kicker)', () => {
    const arr = arrangement(
      ['AS', 'AH', 'KD', '5C', '3S'], // Pair AA, K kicker
      ['AD', 'AC', 'QD', '5H', '3H'], // Pair AA, Q kicker
      ['3C', '4H', '5D'],
    )
    expect(validateArrangement(arr)).toBe(true)
  })

  it('middle wins on kicker → foul (Pair AA, Q kicker vs Pair AA, K kicker)', () => {
    const arr = arrangement(
      ['AD', 'AC', 'QD', '5H', '3H'], // Pair AA, Q kicker
      ['AS', 'AH', 'KD', '5C', '3S'], // Pair AA, K kicker
      ['3C', '4H', '5D'],
    )
    expect(validateArrangement(arr)).toBe(false)
  })

  it('royal Flush (back) vs Straight Flush (middle) → valid', () => {
    const arr = arrangement(
      ['AS', 'KS', 'QS', 'JS', 'TS'], // Royal Flush
      ['9H', '8H', '7H', '6H', '5H'], // Straight Flush
      ['2C', '3D', '4S'],
    )
    expect(validateArrangement(arr)).toBe(true)
  })

  it('straight (back) vs Flush (middle) → foul', () => {
    const arr = arrangement(
      ['8H', '7D', '6C', '5S', '4H'], // Straight
      ['AS', 'KS', 'QS', 'JS', '9S'], // Flush
      ['2C', '3D', 'TC'],
    )
    expect(validateArrangement(arr)).toBe(false)
  })

  it('four Kings (back) vs Four Queens (middle) → valid', () => {
    const arr = arrangement(
      ['KS', 'KH', 'KD', 'KC', '5S'], // Four Kings
      ['QS', 'QH', 'QD', 'QC', '4S'], // Four Queens
      ['2C', '3D', 'TC'],
    )
    expect(validateArrangement(arr)).toBe(true)
  })
})
