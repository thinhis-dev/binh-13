import { getDb } from '../db'

type SessionRow = {
  player_id: number
  name: string
  socket_id: string
}

export type Session = {
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

  return Number(result.lastInsertRowid)
}

export function updateSocketId(playerId: number, socketId: string): void {
  getDb()
    .prepare('UPDATE sessions SET socket_id = ? WHERE player_id = ?')
    .run(socketId, playerId)
}

export function getSession(playerId: number): Session | undefined {
  const row = getDb()
    .prepare('SELECT player_id, name, socket_id FROM sessions WHERE player_id = ?')
    .get(playerId) as SessionRow | undefined

  return row ? mapSession(row) : undefined
}

export function getSessionBySocketId(
  socketId: string,
): Pick<Session, 'playerId' | 'name'> | undefined {
  const row = getDb()
    .prepare('SELECT player_id, name, socket_id FROM sessions WHERE socket_id = ?')
    .get(socketId) as SessionRow | undefined

  return row
    ? {
        playerId: row.player_id,
        name: row.name,
      }
    : undefined
}

function mapSession(row: SessionRow): Session {
  return {
    playerId: row.player_id,
    name: row.name,
    socketId: row.socket_id,
  }
}
