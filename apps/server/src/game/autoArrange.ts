import type { Card, PlayerArrangement } from '@binh-13/shared'
import { Hand } from 'pokersolver'
import { toPokersolverFormat } from './evaluator'

function* combinations<T>(items: T[], size: number, start = 0): Generator<T[]> {
  if (size === 0) {
    yield []
    return
  }
  for (let i = start; i <= items.length - size; i++) {
    for (const rest of combinations(items, size - 1, i + 1))
      yield [items[i], ...rest]
  }
}

/** The strongest 5-card hand among the cards, ranked by pokersolver. */
function strongestFive(cards: Card[]): Card[] {
  const candidates = [...combinations(cards, 5)]
  const solved = candidates.map(combo => Hand.solve(combo.map(toPokersolverFormat)))
  const [best] = Hand.winners(solved)
  return candidates[solved.indexOf(best)]
}

/**
 * Greedy auto-arrangement: Back is the strongest 5 of the 13 cards, Middle is the strongest
 * 5 of the other 8, and Front is the last 3. Back is the best hand of all 13 cards, so it is
 * never weaker than Middle and the result never fouls.
 */
export function autoArrange(playerId: number, hand: Card[]): PlayerArrangement {
  const group1 = strongestFive(hand)
  const rest = hand.filter(card => !group1.includes(card))
  const group2 = strongestFive(rest)
  const group3 = rest.filter(card => !group2.includes(card))

  return {
    playerId,
    group1: group1 as PlayerArrangement['group1'],
    group2: group2 as PlayerArrangement['group2'],
    group3: group3 as PlayerArrangement['group3'],
  }
}
