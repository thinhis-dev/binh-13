import type { BoardArrangement, Card } from '../types'
import { describe, expect, it } from 'vitest'
import { compareInstantWin, detectInstantWin, INSTANT_WIN_NAME, INSTANT_WIN_ORDER } from '../instantWin'

function cards(ids: string): Card[] {
  return ids.split(' ').map(id => ({
    id,
    rank: id[0] as Card['rank'],
    suit: id[1] as Card['suit'],
  }))
}

/** Back, Middle, Front as space-separated card ids. */
function board(back: string, middle: string, front: string): BoardArrangement {
  return { group1: cards(back), group2: cards(middle), group3: cards(front) }
}

describe('detectInstantWin', () => {
  it('detects a Dragon: 13 different ranks', () => {
    expect(detectInstantWin(board('AS KH QD JC TS', '9H 8D 7C 6S 5H', '4D 3C 2S'))).toBe('dragon')
  })

  it('prefers Dragon when the hand is also Same color', () => {
    expect(detectInstantWin(board('AS KC QS JC TS', '9C 8S 7C 6S 5C', '4S 3C 2S'))).toBe('dragon')
  })

  it('detects Same color with 12 cards of one color', () => {
    expect(detectInstantWin(board('AH AD KH KD 2S', 'QH QD JH 9D 8H', '7D 6H 5D'))).toBe('same_color')
  })

  it('returns null for 11 red cards and no other kind', () => {
    expect(detectInstantWin(board('AH KD QH JD 9H', '8D 7H 5D 4H 3D', '2H 2S 6C'))).toBeNull()
  })

  it('detects Six pairs with five pairs plus a single trips', () => {
    expect(detectInstantWin(board('AS AH KS KH QC', 'QD JS JH 9C 9D', '5S 5H 5C'))).toBe('six_pairs')
  })

  it('detects Six pairs with two four-of-a-kinds plus two pairs', () => {
    expect(detectInstantWin(board('AS AH AD AC 2C', 'KS KH KD KC 9D', 'QS QH 9C'))).toBe('six_pairs')
  })

  it('detects Three straights with a wheel Back, a normal Middle, and A-2-3 Front', () => {
    expect(detectInstantWin(board('AS 2H 3D 4C 5S', '9H TD JC QS KH', 'AD 2S 3C'))).toBe('three_straights')
  })

  it('detects Three straights with a Q-K-A Front', () => {
    expect(detectInstantWin(board('2S 3H 4D 5C 6S', '3D 4C 5H 6D 7C', 'QD KS AC'))).toBe('three_straights')
  })

  it('does not count K-A-2 as a Front straight', () => {
    expect(detectInstantWin(board('3S 4H 5D 6C 7S', '7H 8D 9C TS JH', 'KD AS 2C'))).toBeNull()
  })

  it('detects Three flushes, even when the arrangement fouls', () => {
    // Middle (flush, ace high) beats Back (flush, jack high): a foul.
    expect(detectInstantWin(board('JS 9S 6S 4S 2S', 'AH QH 8H 5H 3H', 'KD TD 9D'))).toBe('three_flushes')
  })

  it('counts a straight flush as a flush', () => {
    expect(detectInstantWin(board('9S 8S 7S 6S 5S', 'AH QH 8H 5H 3H', 'KC TC 2C'))).toBe('three_flushes')
  })

  it('returns null for an ordinary hand', () => {
    expect(detectInstantWin(board('AS AH KD 7C 3S', 'QS QC 9D 6H 2D', 'JC 8S 4H'))).toBeNull()
  })

  it('returns null for an incomplete board', () => {
    expect(detectInstantWin(board('AS KH QD JC TS', '9H 8D 7C 6S 5H', '4D 3C'))).toBeNull()
  })
})

describe('instant-win order', () => {
  it('ranks Dragon > Same color > Six pairs > Three flushes > Three straights', () => {
    expect(INSTANT_WIN_ORDER).toEqual(['dragon', 'same_color', 'six_pairs', 'three_flushes', 'three_straights'])
    expect(compareInstantWin('dragon', 'same_color')).toBe(1)
    expect(compareInstantWin('three_straights', 'three_flushes')).toBe(-1)
    expect(compareInstantWin('six_pairs', 'six_pairs')).toBe(0)
  })

  it('names every kind', () => {
    expect(INSTANT_WIN_NAME.dragon).toBe('Dragon (Sanh rong)')
    for (const kind of INSTANT_WIN_ORDER)
      expect(INSTANT_WIN_NAME[kind]).toBeTruthy()
  })
})
