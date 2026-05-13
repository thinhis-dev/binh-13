import type { Card, Rank, Suit } from '@binh-13/shared'
import crypto from 'node:crypto'

const SUITS: Suit[] = ['S', 'H', 'D', 'C']
const RANKS: Rank[] = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'T',
  'J',
  'Q',
  'K',
  'A',
]

/** Creates a standard 52-card deck in a consistent order. */
export function createDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: rank + suit, rank, suit })
    }
  }
  return deck
}

/**
 * Fisher-Yates shuffle using crypto.randomBytes for cryptographic fairness.
 * Mutates the array in place and returns it.
 */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    // Get a random index in [0, i]
    const randomBytes = crypto.randomBytes(4)
    const randomUint = randomBytes.readUInt32BE(0)
    const j = randomUint % (i + 1)
    ;[array[i], array[j]] = [array[j], array[i]]
  }
  return array
}

/**
 * Deals 13 cards to each of the given number of players.
 * Returns an array of hands (one array of 13 Cards per player).
 */
export function deal(playerCount: 2 | 3 | 4 = 2): Card[][] {
  if (playerCount < 2 || playerCount > 4) {
    throw new Error('Player count must be 2, 3, or 4')
  }
  const deck = shuffle(createDeck())
  const hands: Card[][] = []
  for (let p = 0; p < playerCount; p++) {
    hands.push(deck.slice(p * 13, (p + 1) * 13))
  }
  return hands
}
