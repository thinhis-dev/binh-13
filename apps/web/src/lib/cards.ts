import type { Card, Rank, Suit } from '@binh-13/shared'

export const SUIT_SYMBOL: Record<Suit, string> = {
  S: '♠',
  H: '♥',
  D: '♦',
  C: '♣',
}

export const SUIT_LABEL: Record<Suit, string> = {
  S: 'Spades',
  H: 'Hearts',
  D: 'Diamonds',
  C: 'Clubs',
}

export const RANK_VALUE: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

export const RANK_LABEL: Record<Rank, string> = {
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  T: '10',
  J: 'J',
  Q: 'Q',
  K: 'K',
  A: 'A',
}

export const RED_SUITS = new Set<Suit>(['H', 'D'])

/** Bridge-convention suit ordering: Spades > Hearts > Diamonds > Clubs */
export const SUIT_VALUE: Record<Suit, number> = {
  S: 4,
  H: 3,
  D: 2,
  C: 1,
}

/** Convert internal card id to pokersolver format: "AS" → "As", "TH" → "Th" */
export function toPokerSolver(id: string): string {
  return id[0] + id.slice(1).toLowerCase()
}

/**
 * Returns a new array of cards sorted descending by rank (A high), then by
 * suit (Spades > Hearts > Diamonds > Clubs). Does not mutate the input.
 */
export function sortCards(cards: Card[]): Card[] {
  return cards.toSorted((a, b) => {
    const rankDiff = RANK_VALUE[b.rank] - RANK_VALUE[a.rank]
    if (rankDiff !== 0) return rankDiff
    return SUIT_VALUE[b.suit] - SUIT_VALUE[a.suit]
  })
}
