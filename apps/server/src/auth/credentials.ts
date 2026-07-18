import { getDb } from '../db'

export interface CredentialedPlayer {
  playerId: number
  name: string
  avatar: string
  passwordHash: string
}

export function hasUsername(playerId: number): boolean {
  const row = getDb()
    .prepare('SELECT username FROM players WHERE id = ?')
    .get(playerId) as { username: string | null } | undefined
  return Boolean(row?.username)
}

export function isUsernameTaken(username: string): boolean {
  const row = getDb().prepare('SELECT id FROM players WHERE username = ?').get(username)
  return Boolean(row)
}

export function setCredentials(playerId: number, username: string, passwordHash: string): void {
  getDb()
    .prepare('UPDATE players SET username = ?, password_hash = ? WHERE id = ?')
    .run(username, passwordHash, playerId)
}

export function getPlayerByUsername(username: string): CredentialedPlayer | undefined {
  const row = getDb()
    .prepare('SELECT id, name, avatar, password_hash FROM players WHERE username = ?')
    .get(username) as { id: number, name: string, avatar: string, password_hash: string | null } | undefined

  if (!row || !row.password_hash)
    return undefined

  return {
    playerId: row.id,
    name: row.name,
    avatar: row.avatar,
    passwordHash: row.password_hash,
  }
}
