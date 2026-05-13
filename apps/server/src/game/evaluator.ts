import { Hand } from 'pokersolver'
import type { Card } from '@binh-13/shared'

// Re-export shared 3-card evaluator for convenience
export {
  evaluateThreeCard,
  compareThreeCard,
  THREE_CARD_CATEGORY_NAME,
  RANK_VALUE,
  type ThreeCardRank,
  type ThreeCardCategory,
} from '@binh-13/shared'

/**
 * Convert internal card format to pokersolver format.
 * "AS" → "As", "TH" → "Th", "2C" → "2c"
 */
export function toPokersolverFormat(card: Card): string {
  return card.rank + card.suit.toLowerCase()
}

/**
 * Evaluate a 5-card hand using pokersolver.
 * Returns the Hand object with name and descr properties.
 */
export function evaluateFiveCard(cards: Card[]): Hand {
  if (cards.length !== 5) {
    throw new Error(
      `evaluateFiveCard expects exactly 5 cards, got ${cards.length}`,
    )
  }
  return Hand.solve(cards.map(toPokersolverFormat))
}

/**
 * Compare two 5-card hands.
 * Returns 1 if a wins, -1 if b wins, 0 if draw.
 */
export function compareFiveCard(a: Card[], b: Card[]): -1 | 0 | 1 {
  const handA = evaluateFiveCard(a)
  const handB = evaluateFiveCard(b)
  const winners = Hand.winners([handA, handB])
  if (winners.length === 2) return 0
  return winners[0] === handA ? 1 : -1
}

/**
 * Get human-readable hand description, e.g. "Full House, Queens full of Nines".
 */
export function describeFiveCard(cards: Card[]): string {
  return evaluateFiveCard(cards).descr
}
