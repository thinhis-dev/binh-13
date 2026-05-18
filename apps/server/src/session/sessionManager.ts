import { getDb } from '../db'
import { logger } from '../lib/logger'

interface SessionRow {
  player_id: number
  name: string
  socket_id: string
}

export interface Session {
  playerId: number
  name: string
  socketId: string
}

export function createSession(name: string, socketId: string): number {
  const result = getDb()
    .prepare(
      `
      INSERT INTO sessions (name, socket_id, created_at)
      VALUES (?, ?, ?)
    `,
    )
    .run(name, socketId, Date.now())

  const playerId = Number(result.lastInsertRowid)
  logger.debug({ playerId, socketId }, 'Session created')
  return playerId
}

export function updateSocketId(playerId: number, socketId: string): void {
  getDb()
    .prepare('UPDATE sessions SET socket_id = ? WHERE player_id = ?')
    .run(socketId, playerId)
  logger.debug({ playerId, socketId }, 'Session socket updated')
}

export function getSession(playerId: number): Session | undefined {
  const row = getDb()
    .prepare('SELECT player_id, name, socket_id FROM sessions WHERE player_id = ?')
    .get(playerId) as SessionRow | undefined

  const session = row ? mapSession(row) : undefined
  logger.debug({ playerId, found: Boolean(session) }, 'Session lookup')
  return session
}

export function getSessionBySocketId(
  socketId: string,
): Pick<Session, 'playerId' | 'name'> | undefined {
  const row = getDb()
    .prepare('SELECT player_id, name, socket_id FROM sessions WHERE socket_id = ?')
    .get(socketId) as SessionRow | undefined

  const session = row
    ? {
        playerId: row.player_id,
        name: row.name,
      }
    : undefined

  logger.debug({ socketId, found: Boolean(session) }, 'Session socket lookup')
  return session
}

export function deleteSession(playerId: number): void {
  const db = getDb()

  const del = db.transaction(() => {
    db.prepare('DELETE FROM arrangements WHERE player_id = ?').run(playerId)
    db.prepare('DELETE FROM hands WHERE player_id = ?').run(playerId)
    db.prepare('DELETE FROM room_players WHERE player_id = ?').run(playerId)
    // Deleting rooms where this player is the creator cascades to
    // room_players/hands/arrangements for those rooms via ON DELETE CASCADE on room_code FK
    db.prepare('DELETE FROM rooms WHERE created_by = ?').run(playerId)
    db.prepare('DELETE FROM sessions WHERE player_id = ?').run(playerId)
  })

  del()
  logger.debug({ playerId }, 'Session deleted')
}

function mapSession(row: SessionRow): Session {
  return {
    playerId: row.player_id,
    name: row.name,
    socketId: row.socket_id,
  }
}
