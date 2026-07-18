import type Database from 'better-sqlite3'

export interface Migration {
  version: number
  name: string
  up: (db: Database.Database) => void
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'baseline-players-sessions-rooms',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS players (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          name         TEXT    NOT NULL,
          avatar       TEXT    NOT NULL DEFAULT 'default',
          created_at   INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
          player_id    INTEGER PRIMARY KEY REFERENCES players(id),
          socket_id    TEXT    NOT NULL DEFAULT '',
          connected_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rooms (
          code          TEXT    PRIMARY KEY,
          status        TEXT    NOT NULL DEFAULT 'waiting',
          created_by    INTEGER NOT NULL REFERENCES players(id),
          created_at    INTEGER NOT NULL,
          current_round INTEGER NOT NULL DEFAULT 1,
          settings_json TEXT    NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS room_players (
          room_code TEXT    NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
          player_id INTEGER NOT NULL REFERENCES players(id),
          seat      INTEGER NOT NULL,
          connected INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (room_code, player_id)
        );

        CREATE TABLE IF NOT EXISTS hands (
          room_code  TEXT    NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
          player_id  INTEGER NOT NULL REFERENCES players(id),
          cards_json TEXT    NOT NULL,
          PRIMARY KEY (room_code, player_id)
        );

        CREATE TABLE IF NOT EXISTS arrangements (
          room_code        TEXT    NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
          player_id        INTEGER NOT NULL REFERENCES players(id),
          arrangement_json TEXT    NOT NULL,
          submitted_at     INTEGER NOT NULL,
          PRIMARY KEY (room_code, player_id)
        );
      `)
    },
  },
]

const LEGACY_TABLE_NAMES = ['sessions', 'rooms', 'room_players', 'hands', 'arrangements', 'players']

/**
 * Applies every migration in `migrationList` with a version higher than what's
 * already recorded in `schema_migrations`, in ascending order, each inside its
 * own transaction. Throws (and applies nothing further) if the DB is already
 * at a version the code doesn't know about, or if it has tables from before
 * versioning existed.
 */
export function applyMigrations(db: Database.Database, migrationList: Migration[] = migrations): void {
  const schemaMigrationsExisted = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`)
    .get()

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT    NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `)

  if (!schemaMigrationsExisted) {
    const legacyTable = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${LEGACY_TABLE_NAMES.map(() => '?').join(',')})`,
      )
      .get(...LEGACY_TABLE_NAMES)

    if (legacyTable) {
      throw new Error(
        'Pre-versioning database detected (tables exist but schema_migrations does not). '
        + 'Schema is now versioned — delete dev.db and restart. There is no production data to preserve.',
      )
    }
  }

  const { maxVersion } = db
    .prepare('SELECT MAX(version) AS maxVersion FROM schema_migrations')
    .get() as { maxVersion: number | null }
  const currentVersion = maxVersion ?? 0

  const latestKnownVersion = migrationList.reduce((max, m) => Math.max(max, m.version), 0)
  if (currentVersion > latestKnownVersion) {
    throw new Error(
      `Database is at schema version ${currentVersion}, but this code only knows migrations up to `
      + `version ${latestKnownVersion}. Refusing to start with older code against a newer database.`,
    )
  }

  const pending = migrationList
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version)

  for (const migration of pending) {
    const applyOne = db.transaction(() => {
      migration.up(db)
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
        .run(migration.version, migration.name, Date.now())
    })
    applyOne()
  }
}

/** Drops every user table (and schema_migrations) so migrations can be re-run from zero. Test-only. */
export function dropAllTables(db: Database.Database): void {
  const tables = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .all() as Array<{ name: string }>

  db.pragma('foreign_keys = OFF')
  for (const { name } of tables) {
    db.exec(`DROP TABLE IF EXISTS "${name}"`)
  }
  db.pragma('foreign_keys = ON')
}
