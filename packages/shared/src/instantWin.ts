import type { BoardArrangement, Card } from './types'
import { RANK_VALUE } from './evaluator'

/**
 * Mau Binh instant-win hands (Mau binh toi trang). A player with one wins the round 3-0,
 * whatever the other groups hold, and even when the arrangement fouls.
 */
export type InstantWinKind
  = | 'dragon'
    | 'same_color'
    | 'six_pairs'
    | 'three_flushes'
    | 'three_straights'

/** Strongest first. Between two instant wins, the earlier kind wins. An equal kind is a draw. */
export const INSTANT_WIN_ORDER: InstantWinKind[] = [
  'dragon',
  'same_color',
  'six_pairs',
  'three_flushes',
  'three_straights',
]

export const INSTANT_WIN_NAME: Record<InstantWinKind, string> = {
  dragon: 'Dragon (Sanh rong)',
  same_color: 'Same color (Dong mau)',
  six_pairs: 'Six pairs (Luc phe bon)',
  three_flushes: 'Three flushes (3 thung)',
  three_straights: 'Three straights (3 sanh)',
}

const RED_SUITS = new Set(['H', 'D'])

function values(cards: Card[]) {
  return cards.map(card => RANK_VALUE[card.rank] ?? 0).sort((a, b) => a - b)
}

function isOneSuit(cards: Card[]) {
  return cards.every(card => card.suit === cards[0].suit)
}

/** Consecutive ranks. The ace also counts low, so A-2-3 and A-2-3-4-5 are straights. */
function isStraight(cards: Card[]) {
  const sorted = values(cards)
  if (new Set(sorted).size !== sorted.length)
    return false
  if (sorted.at(-1)! - sorted[0] === sorted.length - 1)
    return true
  // Ace low: move the ace (14) to 1 and check again.
  if (sorted.at(-1) !== 14)
    return false
  const aceLow = [1, ...sorted.slice(0, -1)]
  return aceLow.at(-1)! - aceLow[0] === aceLow.length - 1
}

function isDragon(hand: Card[]) {
  return new Set(hand.map(card => card.rank)).size === 13
}

function isSameColor(hand: Card[]) {
  const red = hand.filter(card => RED_SUITS.has(card.suit)).length
  return red >= 12 || hand.length - red >= 12
}

/** Trips count as one pair. Four of a kind counts as two pairs. */
function isSixPairs(hand: Card[]) {
  const counts = new Map<string, number>()
  for (const card of hand)
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1)
  let pairs = 0
  for (const count of counts.values())
    pairs += Math.floor(count / 2)
  return pairs >= 6
}

/**
 * The strongest instant-win kind of a board, or null. Dragon, Same color, and Six pairs look
 * at all 13 cards. Three flushes and Three straights look at the arrangement. No pokersolver
 * is needed, so the client preview and the server result use the same check.
 */
export function detectInstantWin(board: BoardArrangement): InstantWinKind | null {
  const { group1, group2, group3 } = board
  if (group1.length !== 5 || group2.length !== 5 || group3.length !== 3)
    return null
  const hand = [...group1, ...group2, ...group3]

  if (isDragon(hand))
    return 'dragon'
  if (isSameColor(hand))
    return 'same_color'
  if (isSixPairs(hand))
    return 'six_pairs'
  if (isOneSuit(group1) && isOneSuit(group2) && isOneSuit(group3))
    return 'three_flushes'
  if (isStraight(group1) && isStraight(group2) && isStraight(group3))
    return 'three_straights'
  return null
}

/** Returns 1 if a is the stronger kind, -1 if b is, 0 if they are the same kind. */
export function compareInstantWin(a: InstantWinKind, b: InstantWinKind): -1 | 0 | 1 {
  const diff = INSTANT_WIN_ORDER.indexOf(b) - INSTANT_WIN_ORDER.indexOf(a)
  return diff > 0 ? 1 : diff < 0 ? -1 : 0
}
