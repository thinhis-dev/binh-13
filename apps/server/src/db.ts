import path from 'node:path'
import Database from 'better-sqlite3'
import { logger } from './lib/logger'
import { applyMigrations, dropAllTables } from './migrations'

let _db: Database.Database | null = null

export function initDb(): Database.Database {
  const dbPath = process.env.DATABASE_PATH ?? './dev.db'
  closeDb()

  _db = new Database(dbPath === ':memory:' ? dbPath : path.resolve(dbPath))
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  applyMigrations(_db)
  logger.info({ dbPath }, 'Database initialized')
  return _db
}

export function getDb(): Database.Database {
  if (!_db)
    throw new Error('Database not initialized. Call initDb() first.')
  return _db
}

/**
 * Test-only: wipes every table and re-runs all migrations from zero. Guarded
 * so it can never wipe a real database — only `:memory:` or NODE_ENV=test.
 */
export function resetDb(): void {
  const dbPath = process.env.DATABASE_PATH
  const isTestEnv = process.env.NODE_ENV === 'test'
  if (dbPath !== ':memory:' && !isTestEnv) {
    throw new Error(
      'resetDb() refused: only allowed when DATABASE_PATH=":memory:" or NODE_ENV="test". '
      + 'It would wipe a real database otherwise.',
    )
  }

  const db = getDb()
  dropAllTables(db)
  applyMigrations(db)
}

export function closeDb(): void {
  _db?.close()
  _db = null
}
