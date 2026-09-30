import type { Card } from './types'
import { RANK_VALUE } from './evaluator'

/**
 * Lightweight foul check for FE live preview.
 * Uses basic category estimation without pokersolver.
 *
 * Returns true if arrangement is LIKELY valid, false if DEFINITELY foul.
 * The server performs the authoritative check.
 */
export function quickFoulCheck(group1: Card[], group2: Card[]): boolean {
  if (group1.length !== 5 || group2.length !== 5) {
    // Can't check incomplete groups — assume valid
    return true
  }

  const cat1 = estimateFiveCardCategory(group1)
  const cat2 = estimateFiveCardCategory(group2)

  if (cat2 > cat1)
    return false // Middle is clearly stronger → foul
  if (cat1 > cat2)
    return true // Back is clearly stronger → valid

  // Same category — inconclusive, let server decide
  return true
}

export const FIVE_CARD_CATEGORY_NAME: Record<number, string> = {
  0: 'High Card',
  1: 'One Pair',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
}

/**
 * Rough 5-card category estimator (no pokersolver), 0 = High Card to 8 = Straight Flush.
 * Used for the client preview only; the server ranks hands with pokersolver.
 */
export function estimateFiveCardCategory(cards: Card[]): number {
  const values = cards.map(c => RANK_VALUE[c.rank] ?? 0)
  const suits = cards.map(c => c.suit)

  const freq = new Map<number, number>()
  for (const v of values) {
    freq.set(v, (freq.get(v) ?? 0) + 1)
  }

  const counts = Array.from(freq.values()).sort((a, b) => b - a)
  const isFlush = suits.every(s => s === suits[0])
  const sorted = [...values].sort((a, b) => a - b)
  const isSequential = sorted[4] - sorted[0] === 4 && new Set(sorted).size === 5

  // Four of a Kind (7)
  if (counts[0] === 4)
    return 7
  // Full House (6)
  if (counts[0] === 3 && counts[1] === 2)
    return 6
  // Flush (5)
  if (isFlush && !isSequential)
    return 5
  // Straight (4)
  if (isSequential && !isFlush)
    return 4
  // Straight Flush / Royal Flush (8/9) — both flush + sequential
  if (isFlush && isSequential)
    return 8
  // Three of a Kind (3)
  if (counts[0] === 3)
    return 3
  // Two Pair (2)
  if (counts[0] === 2 && counts[1] === 2)
    return 2
  // One Pair (1)
  if (counts[0] === 2)
    return 1
  // High Card (0)
  return 0
}
