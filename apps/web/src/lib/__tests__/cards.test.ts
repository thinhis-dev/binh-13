import { describe, expect, it } from 'vitest'
import {
  RANK_LABEL,
  RANK_VALUE,
  RED_SUITS,
  SUIT_LABEL,
  SUIT_SYMBOL,
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
