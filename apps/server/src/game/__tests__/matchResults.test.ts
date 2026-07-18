import type { RoundResult } from '@binh-13/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb } from '../../__tests__/helpers/testDb'
import { getDb } from '../../db'
import { createSession } from '../../session/sessionManager'
import { getPlayerStats, recordRoundResult } from '../matchResults'

const DUMMY_GROUP = { result: 'p1', p1Hand: 'x', p2Hand: 'y', p1Foul: false, p2Foul: false } as const
const DUMMY_ARRANGEMENT = { playerId: 0, group1: [], group2: [], group3: [] } as never

function makeResult(overrides: Partial<RoundResult> = {}): RoundResult {
  return {
    group1: DUMMY_GROUP,
    group2: DUMMY_GROUP,
    group3: DUMMY_GROUP,
    winner: 'p1',
    p1Score: 3,
    p2Score: 0,
    p1Foul: false,
    p2Foul: false,
    arrangements: { p1: DUMMY_ARRANGEMENT, p2: DUMMY_ARRANGEMENT },
    ...overrides,
  }
}

describe('matchResults', () => {
  let p1Id: number
  let p2Id: number

  beforeEach(() => {
    resetTestDb()
    p1Id = createSession('Alice', 'socket-1')
    p2Id = createSession('Bob', 'socket-2')
  })

  it('recordRoundResult maps a normal RoundResult to row fields correctly', () => {
    recordRoundResult('ROOM01', 1, makeResult({
      winner: 'p1',
      p1Score: 2,
      p2Score: 1,
      p1Foul: false,
      p2Foul: true,
    }), p1Id, p2Id)

    const row = getDb().prepare('SELECT * FROM match_results WHERE room_code = ?').get('ROOM01') as {
      room_code: string
      round: number
      p1_id: number
      p2_id: number
      winner: string
      p1_score: number
      p2_score: number
      p1_fouled: number
      p2_fouled: number
      surrendered_by: number | null
      finished_at: number
    }

    expect(row).toMatchObject({
      room_code: 'ROOM01',
      round: 1,
      p1_id: p1Id,
      p2_id: p2Id,
      winner: 'p1',
      p1_score: 2,
      p2_score: 1,
      p1_fouled: 0,
      p2_fouled: 1,
      surrendered_by: null,
    })
    expect(row.finished_at).toBeGreaterThan(0)
  })

  it('a surrender-shaped result sets surrendered_by', () => {
    recordRoundResult('ROOM02', 1, makeResult({
      winner: 'p2',
      p1Score: 0,
      p2Score: 3,
      surrendered: true,
      surrenderedBy: p1Id,
    }), p1Id, p2Id)

    const row = getDb().prepare('SELECT surrendered_by FROM match_results WHERE room_code = ?').get('ROOM02') as {
      surrendered_by: number
    }
    expect(row.surrendered_by).toBe(p1Id)
  })

  it('getPlayerStats aggregates wins/losses/draws/fouls/sweeps across p1 and p2 appearances', () => {
    // See plan §6.3 test 3 — reviewed fixture: X plays as p1 in some rows, p2 in others.
    const otherId = createSession('Opponent', 'socket-3')
    let round = 1

    // 1. X as p1, wins by sweep (3-0)
    recordRoundResult('ROOM', round++, makeResult({ winner: 'p1', p1Score: 3, p2Score: 0 }), p1Id, otherId)
    // 2. X as p2, wins (not a sweep — 2-1)
    recordRoundResult('ROOM', round++, makeResult({ winner: 'p2', p1Score: 1, p2Score: 2 }), otherId, p1Id)
    // 3. X as p1, loses, and X fouled
    recordRoundResult('ROOM', round++, makeResult({ winner: 'p2', p1Score: 1, p2Score: 2, p1Foul: true }), p1Id, otherId)
    // 4. X as p2, loses
    recordRoundResult('ROOM', round++, makeResult({ winner: 'p1', p1Score: 2, p2Score: 0 }), otherId, p1Id)
    // 5. X as p1, loses (opponent sweeps X — does not count as X's sweep)
    recordRoundResult('ROOM', round++, makeResult({ winner: 'p2', p1Score: 0, p2Score: 3 }), p1Id, otherId)
    // 6. X as p2, draw
    recordRoundResult('ROOM', round++, makeResult({ winner: 'draw', p1Score: 1, p2Score: 1 }), otherId, p1Id)

    expect(getPlayerStats(p1Id)).toEqual({
      games: 6,
      wins: 2,
      losses: 3,
      draws: 1,
      fouls: 1,
      sweeps: 1,
    })
  })

  it('returns all zeros for a player with no recorded rounds', () => {
    expect(getPlayerStats(p1Id)).toEqual({
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      fouls: 0,
      sweeps: 0,
    })
  })
})
