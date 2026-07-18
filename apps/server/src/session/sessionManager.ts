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

export interface PlayerRecord {
  playerId: number
  name: string
  avatar: string
  createdAt: number
  lastSeenAt: number
  username: string | null
}

interface PlayerRow {
  id: number
  name: string
  avatar: string
  created_at: number
  last_seen_at: number
  username: string | null
}

/** Creates a durable `players` row plus an ephemeral `sessions` row for this connection. */
export function createSession(name: string, socketId: string): number {
  const db = getDb()
  const now = Date.now()

  const create = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO players (name, avatar, created_at, last_seen_at) VALUES (?, 'default', ?, ?)`,
      )
      .run(name, now, now)
    const playerId = Number(result.lastInsertRowid)

    db.prepare(
      `INSERT INTO sessions (player_id, socket_id, connected_at) VALUES (?, ?, ?)`,
    ).run(playerId, socketId, now)

    return playerId
  })

  const playerId = create()
  logger.debug({ playerId, socketId }, 'Session created')
  return playerId
}

/**
 * Restores a live session for an existing player (e.g. after SESSION_RESTORE
 * with a valid token): bumps `last_seen_at` and upserts the `sessions` row
 * with the current socket. Returns undefined if the player no longer exists.
 */
export function restoreSession(playerId: number, socketId: string): PlayerRecord | undefined {
  const db = getDb()
  const player = getPlayer(playerId)
  if (!player)
    return undefined

  const now = Date.now()
  const restore = db.transaction(() => {
    db.prepare('UPDATE players SET last_seen_at = ? WHERE id = ?').run(now, playerId)
    db.prepare(
      `INSERT INTO sessions (player_id, socket_id, connected_at) VALUES (?, ?, ?)
       ON CONFLICT(player_id) DO UPDATE SET socket_id = excluded.socket_id, connected_at = excluded.connected_at`,
    ).run(playerId, socketId, now)
  })
  restore()

  logger.debug({ playerId, socketId }, 'Session restored')
  return { ...player, lastSeenAt: now }
}

export function getPlayer(playerId: number): PlayerRecord | undefined {
  const row = getDb()
    .prepare('SELECT id, name, avatar, created_at, last_seen_at, username FROM players WHERE id = ?')
    .get(playerId) as PlayerRow | undefined

  return row
    ? {
        playerId: row.id,
        name: row.name,
        avatar: row.avatar,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        username: row.username,
      }
    : undefined
}

export function updatePlayer(playerId: number, updates: { name?: string, avatar?: string }): void {
  const current = getPlayer(playerId)
  if (!current)
    return

  getDb()
    .prepare('UPDATE players SET name = ?, avatar = ? WHERE id = ?')
    .run(updates.name ?? current.name, updates.avatar ?? current.avatar, playerId)
  logger.debug({ playerId }, 'Player updated')
}

export function updateSocketId(playerId: number, socketId: string): void {
  getDb()
    .prepare('UPDATE sessions SET socket_id = ? WHERE player_id = ?')
    .run(socketId, playerId)
  logger.debug({ playerId, socketId }, 'Session socket updated')
}

export function getSession(playerId: number): Session | undefined {
  const row = getDb()
    .prepare(
      `SELECT p.id AS player_id, p.name, s.socket_id
       FROM sessions s
       JOIN players p ON p.id = s.player_id
       WHERE s.player_id = ?`,
    )
    .get(playerId) as SessionRow | undefined

  const session = row ? mapSession(row) : undefined
  logger.debug({ playerId, found: Boolean(session) }, 'Session lookup')
  return session
}

export function getSessionBySocketId(
  socketId: string,
): Pick<Session, 'playerId' | 'name'> | undefined {
  const row = getDb()
    .prepare(
      `SELECT p.id AS player_id, p.name, s.socket_id
       FROM sessions s
       JOIN players p ON p.id = s.player_id
       WHERE s.socket_id = ?`,
    )
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
