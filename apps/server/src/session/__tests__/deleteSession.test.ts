import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb } from '../../__tests__/helpers/testDb'
import { getDb } from '../../db'
import { createSession, deleteSession, getSession } from '../sessionManager'

describe('deleteSession', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('deletes the session row from the database', () => {
    const playerId = createSession('Alice', 'socket-1')
    expect(getSession(playerId)).toBeDefined()

    deleteSession(playerId)

    expect(getSession(playerId)).toBeUndefined()
  })

  it('deletes dependent room_players rows', () => {
    const db = getDb()
    const playerId = createSession('Alice', 'socket-1')

    // Create a room with this player
    db.prepare(
      `INSERT INTO rooms (code, status, created_by, created_at) VALUES (?, 'waiting', ?, ?)`,
    ).run('ROOM01', playerId, Date.now())
    db.prepare(
      `INSERT INTO room_players (room_code, player_id, seat, connected) VALUES (?, ?, 1, 1)`,
    ).run('ROOM01', playerId)

    deleteSession(playerId)

    const row = db
      .prepare('SELECT * FROM room_players WHERE player_id = ?')
      .get(playerId)
    expect(row).toBeUndefined()
    expect(getSession(playerId)).toBeUndefined()
  })

  it('deletes dependent hands rows', () => {
    const db = getDb()
    const playerId = createSession('Alice', 'socket-1')

    db.prepare(
      `INSERT INTO rooms (code, status, created_by, created_at) VALUES (?, 'waiting', ?, ?)`,
    ).run('ROOM02', playerId, Date.now())
    db.prepare(
      `INSERT INTO room_players (room_code, player_id, seat, connected) VALUES (?, ?, 1, 1)`,
    ).run('ROOM02', playerId)
    db.prepare(
      `INSERT INTO hands (room_code, player_id, cards_json) VALUES (?, ?, ?)`,
    ).run('ROOM02', playerId, '["AS","KS"]')

    deleteSession(playerId)

    const row = db
      .prepare('SELECT * FROM hands WHERE player_id = ?')
      .get(playerId)
    expect(row).toBeUndefined()
  })

  it('deletes dependent arrangements rows', () => {
    const db = getDb()
    const playerId = createSession('Alice', 'socket-1')

    db.prepare(
      `INSERT INTO rooms (code, status, created_by, created_at) VALUES (?, 'waiting', ?, ?)`,
    ).run('ROOM03', playerId, Date.now())
    db.prepare(
      `INSERT INTO room_players (room_code, player_id, seat, connected) VALUES (?, ?, 1, 1)`,
    ).run('ROOM03', playerId)
    db.prepare(
      `INSERT INTO arrangements (room_code, player_id, arrangement_json, submitted_at) VALUES (?, ?, ?, ?)`,
    ).run('ROOM03', playerId, '{}', Date.now())

    deleteSession(playerId)

    const row = db
      .prepare('SELECT * FROM arrangements WHERE player_id = ?')
      .get(playerId)
    expect(row).toBeUndefined()
  })

  it('does not affect other players sessions or data', () => {
    const db = getDb()
    const player1 = createSession('Alice', 'socket-1')
    const player2 = createSession('Bob', 'socket-2')

    // Room created by player1 — will be deleted when player1 session is destroyed
    db.prepare(
      `INSERT INTO rooms (code, status, created_by, created_at) VALUES (?, 'waiting', ?, ?)`,
    ).run('ROOM04', player1, Date.now())
    db.prepare(
      `INSERT INTO room_players (room_code, player_id, seat, connected) VALUES (?, ?, 1, 1)`,
    ).run('ROOM04', player1)
    db.prepare(
      `INSERT INTO room_players (room_code, player_id, seat, connected) VALUES (?, ?, 2, 1)`,
    ).run('ROOM04', player2)

    // Room created by player2 — should NOT be affected
    db.prepare(
      `INSERT INTO rooms (code, status, created_by, created_at) VALUES (?, 'waiting', ?, ?)`,
    ).run('ROOM05', player2, Date.now())
    db.prepare(
      `INSERT INTO room_players (room_code, player_id, seat, connected) VALUES (?, ?, 1, 1)`,
    ).run('ROOM05', player2)

    deleteSession(player1)

    expect(getSession(player1)).toBeUndefined()
    expect(getSession(player2)).toBeDefined()
    // Player2's own room is unaffected
    const player2Room = db
      .prepare('SELECT * FROM room_players WHERE player_id = ? AND room_code = ?')
      .get(player2, 'ROOM05')
    expect(player2Room).toBeDefined()
    // Room created by player1 is gone (cascade)
    const room04 = db.prepare('SELECT * FROM rooms WHERE code = ?').get('ROOM04')
    expect(room04).toBeUndefined()
  })

  it('is a no-op for non-existent player ID', () => {
    expect(() => deleteSession(99999)).not.toThrow()
  })
})
