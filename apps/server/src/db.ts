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
    DROP TABLE IF EXISTS arrangements;
    DROP TABLE IF EXISTS hands;
    DROP TABLE IF EXISTS room_players;
    DROP TABLE IF EXISTS rooms;
    DROP TABLE IF EXISTS sessions;

    CREATE TABLE IF NOT EXISTS sessions (
      player_id  INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      socket_id  TEXT    NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      code       TEXT    PRIMARY KEY,
      status     TEXT    NOT NULL DEFAULT 'waiting',
      created_by INTEGER NOT NULL REFERENCES sessions(player_id),
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS room_players (
      room_code TEXT    NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES sessions(player_id),
      seat      INTEGER NOT NULL,
      connected INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (room_code, player_id)
    );
  `)
}
