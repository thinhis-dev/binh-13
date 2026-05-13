import type { Card, PlayerArrangement } from '@binh-13/shared'
import { deal } from './engine'

export type GameStatus = 'dealing' | 'arranging' | 'comparing' | 'finished'

export type GameInstance = {
  roomCode: string
  hands: Map<number, Card[]> // playerId → 13 dealt cards
  submissions: Map<number, PlayerArrangement> // playerId → submitted arrangement
  timerHandle: ReturnType<typeof setInterval> | null
  timerSeconds: number
  status: GameStatus
}

/** Active games keyed by room code */
const activeGames = new Map<string, GameInstance>()

/**
 * Creates a new game instance for the given room and player IDs.
 * Deals 13 cards to each player.
 */
export function startGame(
  roomCode: string,
  playerIds: [number, number],
  timerSeconds = 60,
): GameInstance {
  const hands = deal(2)
  const instance: GameInstance = {
    roomCode,
    hands: new Map([
      [playerIds[0], hands[0]],
      [playerIds[1], hands[1]],
    ]),
    submissions: new Map(),
    timerHandle: null,
    timerSeconds,
    status: 'arranging',
  }
  activeGames.set(roomCode, instance)
  return instance
}

/** Retrieves an active game by room code. */
export function getGame(roomCode: string): GameInstance | undefined {
  return activeGames.get(roomCode)
}

/**
 * Records a player's submitted arrangement.
 * Returns false if the player has already submitted or the game isn't in progress.
 */
export function submitArrangement(
  roomCode: string,
  playerId: number,
  arrangement: PlayerArrangement,
): boolean {
  const game = activeGames.get(roomCode)
  if (!game || game.status !== 'arranging') return false
  if (game.submissions.has(playerId)) return false

  game.submissions.set(playerId, arrangement)
  return true
}

/** Returns true when all players have submitted their arrangement. */
export function allSubmitted(roomCode: string): boolean {
  const game = activeGames.get(roomCode)
  if (!game) return false
  return game.submissions.size === game.hands.size
}

/** Clears the timer and removes the game instance from memory. */
export function endGame(roomCode: string): void {
  const game = activeGames.get(roomCode)
  if (!game) return

  if (game.timerHandle !== null) {
    clearInterval(game.timerHandle)
    game.timerHandle = null
  }
  activeGames.delete(roomCode)
}

/** Returns the two player IDs in the game, in insertion order. */
export function getPlayerIds(roomCode: string): [number, number] | undefined {
  const game = activeGames.get(roomCode)
  if (!game) return undefined
  const ids = Array.from(game.hands.keys())
  if (ids.length !== 2) return undefined
  return [ids[0], ids[1]]
}
