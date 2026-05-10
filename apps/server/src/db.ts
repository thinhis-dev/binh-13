import Database from 'better-sqlite3'
import path from 'node:path'

let _db: Database.Database | null = null

export function initDb(): Database.Database {
  const dbPath = process.env.DATABASE_PATH ?? './dev.db'
  _db = new Database(path.resolve(dbPath))
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  runMigrations(_db)
  console.log(`Database initialized: ${dbPath}`)
  return _db
}

export function getDb(): Database.Database {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.')
  return _db
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      player_id  TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      code          TEXT PRIMARY KEY,
      status        TEXT NOT NULL DEFAULT 'waiting',
      mode_json     TEXT NOT NULL DEFAULT '{"type":"single"}',
      current_round INTEGER NOT NULL DEFAULT 1,
      created_at    INTEGER NOT NULL,
      expires_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS room_players (
      room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
      player_id TEXT NOT NULL REFERENCES sessions(player_id),
      connected INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (room_code, player_id)
    );

    CREATE TABLE IF NOT EXISTS hands (
      room_code  TEXT NOT NULL,
      player_id  TEXT NOT NULL,
      cards_json TEXT NOT NULL,
      PRIMARY KEY (room_code, player_id)
    );

    CREATE TABLE IF NOT EXISTS arrangements (
      room_code        TEXT NOT NULL,
      player_id        TEXT NOT NULL,
      arrangement_json TEXT NOT NULL,
      submitted_at     INTEGER NOT NULL,
      PRIMARY KEY (room_code, player_id)
    );
  `)
}
