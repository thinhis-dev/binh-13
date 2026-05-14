import type { Card } from './types'
import { RANK_VALUE } from './evaluator'

/**
 * Determines which cards form the hand rank in a group.
 * Works for both 3-card and 5-card groups.
 * Returns a Set of card IDs that should be highlighted.
 */
export function getHighlightedCardIds(cards: Card[]): Set<string> {
  if (cards.length === 3) return getThreeCardHighlight(cards)
  if (cards.length === 5) return getFiveCardHighlight(cards)
  throw new Error(`Expected 3 or 5 cards, got ${cards.length}`)
}

function buildFreqMap(cards: Card[]): Map<number, Card[]> {
  const freq = new Map<number, Card[]>()
  for (const c of cards) {
    const v = RANK_VALUE[c.rank] ?? 0
    if (!freq.has(v)) freq.set(v, [])
    freq.get(v)!.push(c)
  }
  return freq
}

function getThreeCardHighlight(cards: Card[]): Set<string> {
  const freq = buildFreqMap(cards)

  // Three of a Kind
  for (const group of freq.values()) {
    if (group.length === 3) return new Set(group.map((c) => c.id))
  }

  // One Pair
  for (const group of freq.values()) {
    if (group.length === 2) return new Set(group.map((c) => c.id))
  }

  // High Card — highest rank
  const sorted = [...cards].sort(
    (a, b) => (RANK_VALUE[b.rank] ?? 0) - (RANK_VALUE[a.rank] ?? 0),
  )
  return new Set([sorted[0].id])
}

function getFiveCardHighlight(cards: Card[]): Set<string> {
  const freq = buildFreqMap(cards)

  const isFlush = cards.every((c) => c.suit === cards[0].suit)

  const uniqueValues = [
    ...new Set(cards.map((c) => RANK_VALUE[c.rank] ?? 0)),
  ].sort((a, b) => a - b)
  const isStraight =
    uniqueValues.length === 5 && uniqueValues[4] - uniqueValues[0] === 4

  // Royal Flush, Straight Flush, Flush, Straight — all 5 highlighted
  if (isFlush || isStraight) return new Set(cards.map((c) => c.id))

  // Four of a Kind — the 4 matching cards
  for (const group of freq.values()) {
    if (group.length === 4) return new Set(group.map((c) => c.id))
  }

  // Full House (3 + 2) — all 5
  const counts = [...freq.values()].map((g) => g.length).sort((a, b) => a - b)
  if (counts.length === 2 && counts[0] === 2 && counts[1] === 3) {
    return new Set(cards.map((c) => c.id))
  }

  // Three of a Kind — the 3 matching cards
  for (const group of freq.values()) {
    if (group.length === 3) return new Set(group.map((c) => c.id))
  }

  // Two Pair — the 4 pair cards (both pairs)
  const pairCards: Card[] = []
  for (const group of freq.values()) {
    if (group.length === 2) pairCards.push(...group)
  }
  if (pairCards.length === 4) return new Set(pairCards.map((c) => c.id))

  // One Pair — the 2 matching cards
  for (const group of freq.values()) {
    if (group.length === 2) return new Set(group.map((c) => c.id))
  }

  // High Card — highest rank card only
  const sorted = [...cards].sort(
    (a, b) => (RANK_VALUE[b.rank] ?? 0) - (RANK_VALUE[a.rank] ?? 0),
  )
  return new Set([sorted[0].id])
}
