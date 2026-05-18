import type { Card } from './types'

export type ThreeCardCategory = 2 | 1 | 0 // 2=ThreeOfAKind, 1=OnePair, 0=HighCard

export interface ThreeCardRank {
  category: ThreeCardCategory
  tiebreakers: number[] // descending — matched cards first, then kickers
}

export const RANK_VALUE: Record<string, number> = {
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

export const THREE_CARD_CATEGORY_NAME: Record<ThreeCardCategory, string> = {
  2: 'Three of a Kind',
  1: 'One Pair',
  0: 'High Card',
}

/**
 * Evaluates a 3-card Front group.
 * No flushes or straights — only Three of a Kind, One Pair, High Card.
 */
export function evaluateThreeCard(cards: Card[]): ThreeCardRank {
  if (cards.length !== 3) {
    throw new Error(
      `evaluateThreeCard expects exactly 3 cards, got ${cards.length}`,
    )
  }

  const values = cards.map(c => RANK_VALUE[c.rank] ?? 0).sort((a, b) => b - a)

  const freq = new Map<number, number>()
  for (const v of values) {
    freq.set(v, (freq.get(v) ?? 0) + 1)
  }

  // Three of a Kind
  for (const [rank, count] of freq) {
    if (count === 3) {
      return { category: 2, tiebreakers: [rank] }
    }
  }

  // One Pair
  for (const [rank, count] of freq) {
    if (count === 2) {
      const kicker = values.find(v => v !== rank) ?? 0
      return { category: 1, tiebreakers: [rank, kicker] }
    }
  }

  // High Card
  return { category: 0, tiebreakers: values }
}

/**
 * Compares two ThreeCardRank values.
 * Returns 1 if a wins, -1 if b wins, 0 if draw.
 */
export function compareThreeCard(
  a: ThreeCardRank,
  b: ThreeCardRank,
): -1 | 0 | 1 {
  if (a.category !== b.category) {
    return a.category > b.category ? 1 : -1
  }

  for (let i = 0; i < a.tiebreakers.length; i++) {
    const av = a.tiebreakers[i] ?? 0
    const bv = b.tiebreakers[i] ?? 0
    if (av !== bv)
      return av > bv ? 1 : -1
  }

  return 0
}
