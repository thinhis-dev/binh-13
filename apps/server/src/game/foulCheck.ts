import type { PlayerArrangement } from '@binh-13/shared'
import { compareFiveCard } from './evaluator'

/**
 * Validates a player's arrangement: Back (group1) must rank >= Middle (group2).
 * Group 3 (Front) is independent — no constraint.
 *
 * Returns true if valid, false if foul.
 */
export function validateArrangement(arrangement: PlayerArrangement): boolean {
  const result = compareFiveCard(arrangement.group1, arrangement.group2)
  return result >= 0 // Back wins or draws → valid
}
