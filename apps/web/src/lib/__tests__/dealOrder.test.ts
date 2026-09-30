import { afterEach, describe, expect, it, vi } from 'vitest'
import { sortCards } from '@/lib/cards'
import { DEAL_ORDER_STORAGE_KEY, layoutDeal, readDealOrder, writeDealOrder } from '@/lib/dealOrder'
import { MOCK_HAND } from '@/lib/mockCards'

// Deliberately unsorted, so that 'raw' and 'sorted' give different rows.
const DEALT = [...MOCK_HAND].reverse()

describe('layoutDeal', () => {
  it('splits the raw deal order into Back 5, Middle 5, Front 3', () => {
    const rows = layoutDeal(DEALT, 'raw')

    expect(rows.group1).toEqual(DEALT.slice(0, 5))
    expect(rows.group2).toEqual(DEALT.slice(5, 10))
    expect(rows.group3).toEqual(DEALT.slice(10, 13))
  })

  it('splits the sorted order when the preference is sorted', () => {
    const sorted = sortCards(DEALT)
    const rows = layoutDeal(DEALT, 'sorted')

    expect(rows.group1).toEqual(sorted.slice(0, 5))
    expect(rows.group2).toEqual(sorted.slice(5, 10))
    expect(rows.group3).toEqual(sorted.slice(10, 13))
  })
})

describe('deal order preference', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('defaults to raw when nothing is stored', () => {
    expect(readDealOrder()).toBe('raw')
  })

  it('defaults to raw for an unknown stored value', () => {
    localStorage.setItem(DEAL_ORDER_STORAGE_KEY, 'shuffled')
    expect(readDealOrder()).toBe('raw')
  })

  it('reads back a written value', () => {
    writeDealOrder('sorted')
    expect(readDealOrder()).toBe('sorted')
  })

  it('defaults to raw and does not throw when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(() => writeDealOrder('sorted')).not.toThrow()
    expect(readDealOrder()).toBe('raw')
  })
})
