import type { Card } from '@binh-13/shared'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { sortCards } from '@/lib/cards'
import { MOCK_HAND } from '@/lib/mockCards'
import { useArrangement } from '../useArrangement'

function hand(ids: string): Card[] {
  return ids.split(' ').map(id => ({
    id,
    rank: id[0] as Card['rank'],
    suit: id[1] as Card['suit'],
  }))
}

function ids(cards: Card[]) {
  return cards.map(card => card.id)
}

// Deliberately unsorted deal.
const DEALT = [...MOCK_HAND].reverse()

describe('useArrangement', () => {
  it('deals the cards straight into Back 5, Middle 5, Front 3', () => {
    const { result } = renderHook(() => useArrangement(DEALT))

    expect(result.current.group1).toEqual(DEALT.slice(0, 5))
    expect(result.current.group2).toEqual(DEALT.slice(5, 10))
    expect(result.current.group3).toEqual(DEALT.slice(10, 13))
  })

  it('deals in sorted order when the deal order is sorted', () => {
    const { result } = renderHook(() => useArrangement(DEALT, { order: 'sorted' }))

    expect(result.current.group1).toEqual(sortCards(DEALT).slice(0, 5))
  })

  it('init re-deals new cards with the given order', () => {
    const { result } = renderHook(() => useArrangement(DEALT))

    act(() => result.current.init(MOCK_HAND, 'sorted'))

    expect(result.current.group1).toEqual(sortCards(MOCK_HAND).slice(0, 5))
    expect(result.current.group3).toHaveLength(3)
  })

  it('swaps two cards inside one row and keeps the others in place', () => {
    const { result } = renderHook(() => useArrangement(DEALT))
    const [a, b, c, d, e] = DEALT

    act(() => result.current.swapCards(a.id, c.id))

    expect(result.current.group1).toEqual([c, b, a, d, e])
    expect(result.current.group2).toEqual(DEALT.slice(5, 10))
  })

  it('swaps two cards across rows and keeps the row lengths 5 / 5 / 3', () => {
    const { result } = renderHook(() => useArrangement(DEALT))
    const back = DEALT[1]
    const front = DEALT[12]

    act(() => result.current.swapCards(back.id, front.id))

    expect(result.current.group1[1]).toEqual(front)
    expect(result.current.group3[2]).toEqual(back)
    expect(result.current.group1).toHaveLength(5)
    expect(result.current.group2).toHaveLength(5)
    expect(result.current.group3).toHaveLength(3)
  })

  it('keeps the same rows for a swap with itself or with an unknown card', () => {
    const { result } = renderHook(() => useArrangement(DEALT))
    const before = result.current.group1

    act(() => result.current.swapCards(DEALT[0].id, DEALT[0].id))
    expect(result.current.group1).toBe(before)

    act(() => result.current.swapCards(DEALT[0].id, 'XX'))
    expect(result.current.group1).toBe(before)
  })

  it('sortRows sorts inside each row without moving cards between rows', () => {
    const { result } = renderHook(() => useArrangement(DEALT))

    act(() => result.current.sortRows())

    expect(result.current.group1).toEqual(sortCards(DEALT.slice(0, 5)))
    expect(result.current.group2).toEqual(sortCards(DEALT.slice(5, 10)))
    expect(result.current.group3).toEqual(sortCards(DEALT.slice(10, 13)))
  })

  it('applyArrangement replaces the rows with the same 13 cards', () => {
    const { result } = renderHook(() => useArrangement(DEALT))
    const target = {
      group1: MOCK_HAND.slice(0, 5),
      group2: MOCK_HAND.slice(5, 10),
      group3: MOCK_HAND.slice(10, 13),
    }

    act(() => result.current.applyArrangement(target))

    expect(ids(result.current.group1)).toEqual(ids(target.group1))
    expect(ids(result.current.group2)).toEqual(ids(target.group2))
    expect(ids(result.current.group3)).toEqual(ids(target.group3))
  })

  it('applyArrangement ignores a foreign card, a duplicate card, or wrong row sizes', () => {
    const { result } = renderHook(() => useArrangement(DEALT))
    const before = result.current.group1
    const foreign = { id: 'AH', rank: 'A', suit: 'H' } as Card

    act(() => result.current.applyArrangement({
      group1: [...MOCK_HAND.slice(0, 4), foreign],
      group2: MOCK_HAND.slice(5, 10),
      group3: MOCK_HAND.slice(10, 13),
    }))
    act(() => result.current.applyArrangement({
      group1: [...MOCK_HAND.slice(0, 4), MOCK_HAND[5]],
      group2: MOCK_HAND.slice(5, 10),
      group3: MOCK_HAND.slice(10, 13),
    }))
    act(() => result.current.applyArrangement({
      group1: MOCK_HAND.slice(0, 6),
      group2: MOCK_HAND.slice(6, 10),
      group3: MOCK_HAND.slice(10, 13),
    }))

    expect(result.current.group1).toBe(before)
  })

  it('labels each row with its hand name', () => {
    const cards = hand('AS AH AD 9C 9S KS KH 7D 6C 2D QS QH 3C')
    const { result } = renderHook(() => useArrangement(cards))

    expect(result.current.labels).toEqual({
      group1: 'Full House',
      group2: 'One Pair',
      group3: 'One Pair',
    })
  })

  it('shows no labels when showHandStrength is off', () => {
    const { result } = renderHook(() => useArrangement(DEALT, { showHandStrength: false }))

    expect(result.current.labels).toEqual({ group1: null, group2: null, group3: null })
  })

  it('warns about a foul when Middle is clearly stronger than Back', () => {
    const cards = hand('AS KH 9D 7C 3S QS QH QD 5C 2D JS TH 4C')
    const { result } = renderHook(() => useArrangement(cards))

    expect(result.current.hasFoulWarning).toBe(true)

    // Move two queens into Back: Back becomes a pair, Middle a high card.
    act(() => result.current.swapCards('9D', 'QS'))
    act(() => result.current.swapCards('7C', 'QH'))

    expect(result.current.labels.group1).toBe('One Pair')
    expect(result.current.labels.group2).toBe('High Card')
    expect(result.current.hasFoulWarning).toBe(false)
  })

  it('derives the instant-win kind of the board', () => {
    const threeFlushes = hand('JS 9S 6S 4S 2S AH QH 8H 5H 3H KD TD 9D')
    const { result } = renderHook(() => useArrangement(threeFlushes))

    expect(result.current.instantWin).toBe('three_flushes')

    act(() => result.current.swapCards('JS', 'KD'))
    expect(result.current.instantWin).toBeNull()
  })
})
