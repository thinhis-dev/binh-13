import type { Card } from './types'

export type ThreeCardCategory = 2 | 1 | 0 // 2=ThreeOfAKind, 1=OnePair, 0=HighCard

export type ThreeCardRank = {
  category: ThreeCardCategory
  tiebreakers: number[] // descending — matched cards first, then kickers
}

// TODO Phase 2: implement full evaluator
export function evaluateThreeCard(_cards: Card[]): ThreeCardRank {
  throw new Error('Not implemented')
}

// TODO Phase 2: implement comparison
export function compareThreeCard(
  _a: ThreeCardRank,
  _b: ThreeCardRank,
): -1 | 0 | 1 {
  throw new Error('Not implemented')
}
