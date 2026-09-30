import type { Card } from '@binh-13/shared'
import { sortCards } from '@/lib/cards'

/** How the dealt cards fill the rows: server deal order, or sorted by rank. */
export type DealOrder = 'raw' | 'sorted'

export interface BoardRows {
  group1: Card[] // Back (5)
  group2: Card[] // Middle (5)
  group3: Card[] // Front (3)
}

export const DEAL_ORDER_STORAGE_KEY = 'binh13.dealOrder'

/** Device preference. Falls back to 'raw' when storage is empty, invalid, or blocked. */
export function readDealOrder(): DealOrder {
  try {
    return localStorage.getItem(DEAL_ORDER_STORAGE_KEY) === 'sorted' ? 'sorted' : 'raw'
  }
  catch {
    return 'raw'
  }
}

export function writeDealOrder(order: DealOrder) {
  try {
    localStorage.setItem(DEAL_ORDER_STORAGE_KEY, order)
  }
  catch {
    // Storage is blocked (private mode, disabled site data). The preference stays in memory only.
  }
}

/** Deals 13 cards into Back (cards 1-5), Middle (6-10), and Front (11-13). */
export function layoutDeal(cards: Card[], order: DealOrder): BoardRows {
  const ordered = order === 'sorted' ? sortCards(cards) : cards
  return {
    group1: ordered.slice(0, 5),
    group2: ordered.slice(5, 10),
    group3: ordered.slice(10, 13),
  }
}
