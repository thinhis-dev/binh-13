import type { Card } from '@binh-13/shared'
import type { BoardRows, DealOrder } from '@/lib/dealOrder'
import {
  detectInstantWin,
  estimateFiveCardCategory,
  evaluateThreeCard,
  FIVE_CARD_CATEGORY_NAME,
  quickFoulCheck,
  THREE_CARD_CATEGORY_NAME,
} from '@binh-13/shared'
import { useCallback, useMemo, useState } from 'react'
import { sortCards } from '@/lib/cards'
import { layoutDeal } from '@/lib/dealOrder'

export type GroupKey = 'group1' | 'group2' | 'group3'

export type ArrangementState = BoardRows

export const GROUP_KEYS: GroupKey[] = ['group1', 'group2', 'group3']

const ROW_SIZE: Record<GroupKey, number> = { group1: 5, group2: 5, group3: 3 }

const emptyState: ArrangementState = { group1: [], group2: [], group3: [] }

interface ArrangementOptions {
  order?: DealOrder
  showHandStrength?: boolean
}

function findCard(state: ArrangementState, cardId: string) {
  for (const key of GROUP_KEYS) {
    const index = state[key].findIndex(card => card.id === cardId)
    if (index !== -1)
      return { key, index }
  }
  return null
}

/** True when `next` holds exactly the cards of `current`, with row sizes 5 / 5 / 3. */
function isSameCardSet(current: ArrangementState, next: BoardRows) {
  if (GROUP_KEYS.some(key => next[key].length !== ROW_SIZE[key]))
    return false
  const currentIds = new Set(GROUP_KEYS.flatMap(key => current[key].map(card => card.id)))
  const nextIds = new Set(GROUP_KEYS.flatMap(key => next[key].map(card => card.id)))
  return nextIds.size === currentIds.size && [...nextIds].every(id => currentIds.has(id))
}

function rowLabel(key: GroupKey, cards: Card[]) {
  if (cards.length !== ROW_SIZE[key])
    return null
  if (key === 'group3')
    return THREE_CARD_CATEGORY_NAME[evaluateThreeCard(cards).category]
  return FIVE_CARD_CATEGORY_NAME[estimateFiveCardCategory(cards)] ?? null
}

export function useArrangement(initialCards?: Card[], options: ArrangementOptions = {}) {
  const { order = 'raw', showHandStrength = true } = options
  const [state, setState] = useState<ArrangementState>(() =>
    initialCards ? layoutDeal(initialCards, order) : emptyState,
  )

  const init = useCallback((cards: Card[], dealOrder: DealOrder) => {
    setState(layoutDeal(cards, dealOrder))
  }, [])

  /** Swaps two cards, inside one row or across rows. A no-op keeps the same state object. */
  const swapCards = useCallback((aId: string, bId: string) => {
    setState((current) => {
      if (aId === bId)
        return current
      const a = findCard(current, aId)
      const b = findCard(current, bId)
      if (!a || !b)
        return current

      const next = { ...current, [a.key]: [...current[a.key]] }
      next[b.key] = [...next[b.key]]
      const cardA = current[a.key][a.index]
      next[a.key][a.index] = current[b.key][b.index]
      next[b.key][b.index] = cardA
      return next
    })
  }, [])

  /** Sorts the cards inside each row. Cards never move between rows. */
  const sortRows = useCallback(() => {
    setState(current => ({
      group1: sortCards(current.group1),
      group2: sortCards(current.group2),
      group3: sortCards(current.group3),
    }))
  }, [])

  /** Replaces the board. Ignored unless it holds exactly the current 13 cards. */
  const applyArrangement = useCallback((arrangement: BoardRows) => {
    setState(current => isSameCardSet(current, arrangement)
      ? {
          group1: [...arrangement.group1],
          group2: [...arrangement.group2],
          group3: [...arrangement.group3],
        }
      : current)
  }, [])

  const labels = useMemo<Record<GroupKey, string | null>>(() => ({
    group1: showHandStrength ? rowLabel('group1', state.group1) : null,
    group2: showHandStrength ? rowLabel('group2', state.group2) : null,
    group3: showHandStrength ? rowLabel('group3', state.group3) : null,
  }), [showHandStrength, state.group1, state.group2, state.group3])

  /**
   * True if a foul is DEFINITELY detected (group2 category > group1 category).
   * False when inconclusive — server performs the authoritative check.
   */
  const hasFoulWarning = useMemo(
    () => !quickFoulCheck(state.group1, state.group2),
    [state.group1, state.group2],
  )

  /** The instant-win kind of the board, or null. An instant win overrides a foul. */
  const instantWin = useMemo(() => detectInstantWin(state), [state])

  return {
    ...state,
    init,
    swapCards,
    sortRows,
    applyArrangement,
    labels,
    hasFoulWarning,
    instantWin,
  }
}
