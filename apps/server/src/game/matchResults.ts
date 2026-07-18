import type { PlayerStats, RoundResult } from '@binh-13/shared'
import { getDb } from '../db'
import { logger } from '../lib/logger'

/**
 * Persists a finished round's outcome. Deliberately not FK'd to `rooms` —
 * rooms get torn down when players leave, but stats must outlive the room
 * (same reasoning as the timer-vs-deleted-room bug class, solved here by not
 * coupling instead of coupling carefully).
 */
export function recordRoundResult(
  roomCode: string,
  round: number,
  result: RoundResult,
  p1Id: number,
  p2Id: number,
): void {
  getDb()
    .prepare(
      `INSERT INTO match_results
        (room_code, round, p1_id, p2_id, winner, p1_score, p2_score, p1_fouled, p2_fouled, surrendered_by, finished_at)
       VALUES (@roomCode, @round, @p1Id, @p2Id, @winner, @p1Score, @p2Score, @p1Fouled, @p2Fouled, @surrenderedBy, @finishedAt)`,
    )
    .run({
      roomCode,
      round,
      p1Id,
      p2Id,
      winner: result.winner,
      p1Score: result.p1Score,
      p2Score: result.p2Score,
      p1Fouled: result.p1Foul ? 1 : 0,
      p2Fouled: result.p2Foul ? 1 : 0,
      surrenderedBy: result.surrenderedBy ?? null,
      finishedAt: Date.now(),
    })

  logger.debug({ roomCode, round, p1Id, p2Id, winner: result.winner }, 'Round result recorded')
}

/**
 * There's no persistent round counter elsewhere (rematches replay a fresh
 * single-round game in the same room), so the next round number for a room
 * is simply one past however many rounds are already recorded for it.
 */
export function nextRoundNumber(roomCode: string): number {
  const row = getDb()
    .prepare('SELECT COALESCE(MAX(round), 0) AS maxRound FROM match_results WHERE room_code = ?')
    .get(roomCode) as { maxRound: number }
  return row.maxRound + 1
}

export function getPlayerStats(playerId: number): PlayerStats {
  const row = getDb()
    .prepare(
      `SELECT
        COUNT(*) AS games,
        SUM(CASE WHEN (p1_id = @playerId AND winner = 'p1') OR (p2_id = @playerId AND winner = 'p2') THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN (p1_id = @playerId AND winner = 'p2') OR (p2_id = @playerId AND winner = 'p1') THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN winner = 'draw' THEN 1 ELSE 0 END) AS draws,
        SUM(CASE WHEN (p1_id = @playerId AND p1_fouled = 1) OR (p2_id = @playerId AND p2_fouled = 1) THEN 1 ELSE 0 END) AS fouls,
        SUM(CASE WHEN (p1_id = @playerId AND p1_score = 3) OR (p2_id = @playerId AND p2_score = 3) THEN 1 ELSE 0 END) AS sweeps
       FROM match_results
       WHERE p1_id = @playerId OR p2_id = @playerId`,
    )
    .get({ playerId }) as {
    games: number
    wins: number | null
    losses: number | null
    draws: number | null
    fouls: number | null
    sweeps: number | null
  }

  return {
    games: row.games,
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    draws: row.draws ?? 0,
    fouls: row.fouls ?? 0,
    sweeps: row.sweeps ?? 0,
  }
}
