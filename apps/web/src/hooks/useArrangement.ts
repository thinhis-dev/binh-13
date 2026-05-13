import { useCallback, useMemo, useState } from 'react'
import type { Card } from '@binh-13/shared'

export type GroupKey = 'group1' | 'group2' | 'group3'

export type ArrangementState = {
  hand: Card[]
  group1: Card[]
  group2: Card[]
  group3: Card[]
  selectedCardId: string | null
  /** Original deal order — card ids — used to restore position on return from group */
  originalOrder: string[]
}

const GROUP_CAPACITY: Record<GroupKey, 5 | 3> = {
  group1: 5,
  group2: 5,
  group3: 3,
}

const emptyState: ArrangementState = {
  hand: [],
  group1: [],
  group2: [],
  group3: [],
  selectedCardId: null,
  originalOrder: [],
}

function buildInitialState(cards: Card[]): ArrangementState {
  return {
    hand: cards,
    group1: [],
    group2: [],
    group3: [],
    selectedCardId: null,
    originalOrder: cards.map((c) => c.id),
  }
}

function removeCard(cards: Card[], cardId: string) {
  return cards.filter((card) => card.id !== cardId)
}

function hasCard(cards: Card[], cardId: string) {
  return cards.some((card) => card.id === cardId)
}

export function useArrangement(initialCards?: Card[]) {
  const [state, setState] = useState<ArrangementState>(() =>
    initialCards ? buildInitialState(initialCards) : emptyState,
  )

  const init = useCallback((cards: Card[]) => {
    setState(buildInitialState(cards))
  }, [])

  const selectCard = useCallback((id: string | null) => {
    setState((current) => ({ ...current, selectedCardId: id }))
  }, [])

  const assignToGroup = useCallback((groupKey: GroupKey, card: Card) => {
    setState((current) => {
      const group = current[groupKey]
      if (
        group.length >= GROUP_CAPACITY[groupKey] ||
        !hasCard(current.hand, card.id)
      ) {
        return current
      }

      return {
        ...current,
        hand: removeCard(current.hand, card.id),
        [groupKey]: [...group, card],
        selectedCardId: null,
      }
    })
  }, [])

  const removeFromGroup = useCallback((groupKey: GroupKey, card: Card) => {
    setState((current) => {
      const group = current[groupKey]
      if (!hasCard(group, card.id)) return current

      const restoredHand = [...current.hand, card].sort(
        (a, b) =>
          current.originalOrder.indexOf(a.id) -
          current.originalOrder.indexOf(b.id),
      )

      return {
        ...current,
        hand: restoredHand,
        [groupKey]: removeCard(group, card.id),
        selectedCardId: null,
      }
    })
  }, [])

  /** Atomically move a card from one group to another without touching the hand. */
  const moveToGroup = useCallback(
    (fromKey: GroupKey, toKey: GroupKey, card: Card) => {
      setState((current) => {
        const from = current[fromKey]
        const to = current[toKey]
        if (!hasCard(from, card.id) || to.length >= GROUP_CAPACITY[toKey]) {
          return current
        }

        return {
          ...current,
          [fromKey]: removeCard(from, card.id),
          [toKey]: [...to, card],
          selectedCardId: null,
        }
      })
    },
    [],
  )

  const isComplete = useMemo(
    () =>
      state.group1.length === GROUP_CAPACITY.group1 &&
      state.group2.length === GROUP_CAPACITY.group2 &&
      state.group3.length === GROUP_CAPACITY.group3,
    [state.group1.length, state.group2.length, state.group3.length],
  )

  return {
    ...state,
    init,
    selectCard,
    assignToGroup,
    removeFromGroup,
    moveToGroup,
    isComplete,
  }
}
