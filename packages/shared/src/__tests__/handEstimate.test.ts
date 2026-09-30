import type { Card } from '../types'
import { describe, expect, it } from 'vitest'
import { estimateFiveCardCategory, FIVE_CARD_CATEGORY_NAME } from '../foulCheck'

function hand(ids: string): Card[] {
  return ids.split(' ').map(id => ({
    id,
    rank: id[0] as Card['rank'],
    suit: id[1] as Card['suit'],
  }))
}

describe('estimateFiveCardCategory', () => {
  it.each([
    ['AS KH 9D 7C 3S', 0],
    ['AS AH 9D 7C 3S', 1],
    ['AS AH 9D 9C 3S', 2],
    ['AS AH AD 9C 3S', 3],
    ['9S TH JD QC KS', 4],
    ['AS 9S 7S 4S 2S', 5],
    ['AS AH AD 9C 9S', 6],
    ['AS AH AD AC 9S', 7],
    ['9S TS JS QS KS', 8],
  ])('%s is category %i', (ids, category) => {
    expect(estimateFiveCardCategory(hand(ids))).toBe(category)
  })

  it('names every category', () => {
    for (let category = 0; category <= 8; category++)
      expect(FIVE_CARD_CATEGORY_NAME[category]).toBeTruthy()
    expect(FIVE_CARD_CATEGORY_NAME[4]).toBe('Straight')
  })
})
