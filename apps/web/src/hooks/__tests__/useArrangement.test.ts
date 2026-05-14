import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Card } from '@binh-13/shared'
import { MOCK_HAND } from '@/lib/mockCards'
import { RANK_VALUE } from '@/lib/cards'
import { useArrangement } from '../useArrangement'

const firstCard = MOCK_HAND[0]

function fillGroup(cards: Card[], count: number) {
  return cards.slice(0, count)
}

describe('useArrangement', () => {
  it('initializes hand with cards and empty groups', () => {
    const { result } = renderHook(() => useArrangement(MOCK_HAND))

    expect(result.current.hand).toHaveLength(13)
    expect(result.current.group1).toHaveLength(0)
    expect(result.current.group2).toHaveLength(0)
    expect(result.current.group3).toHaveLength(0)
  })

  it('selects and clears a card id', () => {
    const { result } = renderHook(() => useArrangement(MOCK_HAND))

    act(() => result.current.selectCard(firstCard.id))
    expect(result.current.selectedCardId).toBe(firstCard.id)

    act(() => result.current.selectCard(null))
    expect(result.current.selectedCardId).toBeNull()
  })

  it('moves a card from hand to a group', () => {
    const { result } = renderHook(() => useArrangement(MOCK_HAND))

    act(() => result.current.assignToGroup('group1', firstCard))

    expect(result.current.hand).toHaveLength(12)
    expect(result.current.group1).toEqual([firstCard])
  })

  it('does nothing when the target group is full', () => {
    const { result } = renderHook(() => useArrangement(MOCK_HAND))

    for (const card of fillGroup(MOCK_HAND, 5)) {
      act(() => result.current.assignToGroup('group1', card))
    }

    act(() => result.current.assignToGroup('group1', MOCK_HAND[5]))

    expect(result.current.group1).toHaveLength(5)
    expect(result.current.hand).toHaveLength(8)
    expect(
      result.current.hand.some((card) => card.id === MOCK_HAND[5].id),
    ).toBe(true)
  })

  it('returns a grouped card to hand', () => {
    const { result } = renderHook(() => useArrangement(MOCK_HAND))

    act(() => result.current.assignToGroup('group1', firstCard))
    act(() => result.current.removeFromGroup('group1', firstCard))

    expect(result.current.group1).toHaveLength(0)
    expect(result.current.hand.some((card) => card.id === firstCard.id)).toBe(
      true,
    )
  })

  it('tracks completion only when all groups are full', () => {
    const { result } = renderHook(() => useArrangement(MOCK_HAND))

    expect(result.current.isComplete).toBe(false)

    for (const card of MOCK_HAND.slice(0, 5)) {
      act(() => result.current.assignToGroup('group1', card))
    }
    for (const card of MOCK_HAND.slice(5, 10)) {
      act(() => result.current.assignToGroup('group2', card))
    }

    expect(result.current.isComplete).toBe(false)

    for (const card of MOCK_HAND.slice(10, 13)) {
      act(() => result.current.assignToGroup('group3', card))
    }

    expect(result.current.isComplete).toBe(true)
  })

  it('does not duplicate a card when assigned twice', () => {
    const { result } = renderHook(() => useArrangement(MOCK_HAND))

    act(() => result.current.assignToGroup('group1', firstCard))
    act(() => result.current.assignToGroup('group2', firstCard))

    const allCards = [
      ...result.current.hand,
      ...result.current.group1,
      ...result.current.group2,
      ...result.current.group3,
    ]
    expect(allCards.filter((card) => card.id === firstCard.id)).toHaveLength(1)
    expect(result.current.group2).toHaveLength(0)
  })

  it('resets fully when init is called on an already-initialised hook', () => {
    const { result } = renderHook(() => useArrangement(MOCK_HAND))

    act(() => result.current.assignToGroup('group1', firstCard))
    expect(result.current.group1).toHaveLength(1)
    expect(result.current.hand).toHaveLength(12)

    act(() => result.current.init(MOCK_HAND))

    expect(result.current.hand).toHaveLength(13)
    expect(result.current.group1).toHaveLength(0)
    expect(result.current.selectedCardId).toBeNull()
    expect(result.current.isComplete).toBe(false)
  })

  it('restores a returned card to its original hand position', () => {
    const { result } = renderHook(() => useArrangement(MOCK_HAND))
    const cardAtFive = MOCK_HAND[5] // 9H — index 5 in the original order

    act(() => result.current.assignToGroup('group1', cardAtFive))
    expect(result.current.hand[4]).not.toEqual(cardAtFive) // gap exists

    act(() => result.current.removeFromGroup('group1', cardAtFive))

    expect(result.current.hand[5]).toEqual(cardAtFive) // restored to original index
  })

  it('moveToGroup atomically transfers a card between two groups', () => {
    const { result } = renderHook(() => useArrangement(MOCK_HAND))

    act(() => result.current.assignToGroup('group1', firstCard))
    expect(result.current.group1).toHaveLength(1)
    expect(result.current.hand).toHaveLength(12)

    act(() => result.current.moveToGroup('group1', 'group2', firstCard))

    expect(result.current.group1).toHaveLength(0)
    expect(result.current.group2).toEqual([firstCard])
    // Hand must not be affected
    expect(result.current.hand).toHaveLength(12)
  })

  it('moveToGroup is a no-op when source does not contain the card', () => {
    const { result } = renderHook(() => useArrangement(MOCK_HAND))

    act(() => result.current.moveToGroup('group1', 'group2', firstCard))

    expect(result.current.group1).toHaveLength(0)
    expect(result.current.group2).toHaveLength(0)
    expect(result.current.hand).toHaveLength(13)
  })

  it('moveToGroup is a no-op when the destination group is full', () => {
    const { result } = renderHook(() => useArrangement(MOCK_HAND))

    // Fill group2 to capacity (5)
    for (const card of MOCK_HAND.slice(0, 5)) {
      act(() => result.current.assignToGroup('group2', card))
    }
    act(() => result.current.assignToGroup('group1', MOCK_HAND[5]))

    act(() => result.current.moveToGroup('group1', 'group2', MOCK_HAND[5]))

    expect(result.current.group1).toEqual([MOCK_HAND[5]])
    expect(result.current.group2).toHaveLength(5)
  })

  describe('sortHand', () => {
    it('sorts remaining hand cards by rank descending, suit descending', () => {
      const { result } = renderHook(() => useArrangement(MOCK_HAND))

      act(() => result.current.sortHand())

      const { hand } = result.current
      // Verify non-increasing rank order using numeric RANK_VALUE
      for (let i = 1; i < hand.length; i++) {
        expect(RANK_VALUE[hand[i].rank]).toBeLessThanOrEqual(
          RANK_VALUE[hand[i - 1].rank],
        )
      }
      // First card should be the ace of spades (highest rank + highest suit)
      expect(hand[0].id).toBe('AS')
      // Last card should be 2S (lowest rank in MOCK_HAND)
      expect(hand[hand.length - 1].id).toBe('2S')
    })

    it('does not affect cards already in groups', () => {
      const { result } = renderHook(() => useArrangement(MOCK_HAND))

      // Move some cards to groups
      act(() => result.current.assignToGroup('group1', MOCK_HAND[2])) // QD
      act(() => result.current.assignToGroup('group3', MOCK_HAND[5])) // 9H

      act(() => result.current.sortHand())

      expect(result.current.group1).toEqual([MOCK_HAND[2]])
      expect(result.current.group3).toEqual([MOCK_HAND[5]])
    })

    it('sorts only the remaining cards when some are in groups', () => {
      const { result } = renderHook(() => useArrangement(MOCK_HAND))

      // Remove first three cards to groups, leaving 10 in hand
      act(() => result.current.assignToGroup('group1', MOCK_HAND[0])) // AS
      act(() => result.current.assignToGroup('group1', MOCK_HAND[1])) // KH
      act(() => result.current.assignToGroup('group1', MOCK_HAND[2])) // QD

      act(() => result.current.sortHand())

      const { hand } = result.current
      expect(hand).toHaveLength(10)
      // Hand should start with the highest remaining card (JC at index 3)
      expect(hand[0].id).toBe('JC')
    })

    it('is a no-op when hand is empty (all cards in groups)', () => {
      const { result } = renderHook(() => useArrangement(MOCK_HAND))

      for (const card of MOCK_HAND.slice(0, 5)) {
        act(() => result.current.assignToGroup('group1', card))
      }
      for (const card of MOCK_HAND.slice(5, 10)) {
        act(() => result.current.assignToGroup('group2', card))
      }
      for (const card of MOCK_HAND.slice(10, 13)) {
        act(() => result.current.assignToGroup('group3', card))
      }

      act(() => result.current.sortHand())

      expect(result.current.hand).toHaveLength(0)
    })

    it('clears selectedCardId when sorting', () => {
      const { result } = renderHook(() => useArrangement(MOCK_HAND))

      act(() => result.current.selectCard(firstCard.id))
      expect(result.current.selectedCardId).toBe(firstCard.id)

      act(() => result.current.sortHand())

      expect(result.current.selectedCardId).toBeNull()
    })
  })
})
