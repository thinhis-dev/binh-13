import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb, initDb, resetDb } from '../db'
import { applyMigrations } from '../migrations'
import { createSession } from '../session/sessionManager'

describe('db', () => {
  const originalDbPath = process.env.DATABASE_PATH
  const fileDbPath = path.resolve(process.cwd(), '.coverage-db.sqlite')
  const defaultDbPath = path.resolve(process.cwd(), 'dev.db')

  beforeEach(() => {
    closeDb()
  })

  afterEach(() => {
    process.env.DATABASE_PATH = originalDbPath
    closeDb()

    // On Windows, SQLite WAL mode may briefly hold file locks after close().
    // We also remove the WAL and SHM journal files that SQLite creates.
    for (const base of [fileDbPath, defaultDbPath]) {
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          fs.unlinkSync(base + suffix)
        }
        catch {
          /* absent or transiently locked — safe to ignore */
        }
      }
    }
  })

  it('throws before initialization and resets migrated state', () => {
    expect(() => getDb()).toThrow('Database not initialized')

    initDb()
    const playerId = createSession('Alice', 'socket-a')
    expect(playerId).toBeGreaterThan(0)

    resetDb()

    const row = getDb()
      .prepare('SELECT COUNT(*) AS count FROM sessions')
      .get() as { count: number }

    expect(row.count).toBe(0)
  })

  it('supports file-backed database paths', () => {
    process.env.DATABASE_PATH = fileDbPath

    initDb()

    expect(fs.existsSync(fileDbPath)).toBe(true)
  })

  it('falls back to the default path when DATABASE_PATH is unset', () => {
    delete process.env.DATABASE_PATH

    // initDb resolves './dev.db' relative to cwd. We just verify it doesn't
    // throw and returns a working database instance.
    const db = initDb()
    expect(db).toBeDefined()
    expect(() => db.prepare('SELECT 1').get()).not.toThrow()
  })
})

describe('migration runner', () => {
  const originalDbPath = process.env.DATABASE_PATH
  const originalNodeEnv = process.env.NODE_ENV
  let tmpFiles: string[] = []

  function tmpDbPath(): string {
    const dbPath = path.join(os.tmpdir(), `binh13-migrations-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`)
    tmpFiles.push(dbPath)
    return dbPath
  }

  beforeEach(() => {
    closeDb()
    tmpFiles = []
  })

  afterEach(() => {
    process.env.DATABASE_PATH = originalDbPath
    process.env.NODE_ENV = originalNodeEnv
    closeDb()

    for (const base of tmpFiles) {
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          fs.unlinkSync(base + suffix)
        }
        catch {
          /* absent or transiently locked — safe to ignore */
        }
      }
    }
  })

  it('applies all migrations in order on a fresh DB and records each with a timestamp (AC-P1-1)', () => {
    process.env.DATABASE_PATH = tmpDbPath()
    initDb()

    const rows = getDb()
      .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC')
      .all() as Array<{ version: number, name: string, applied_at: number }>

    expect(rows.length).toBeGreaterThan(0)
    for (const [i, row] of rows.entries()) {
      expect(row.version).toBe(i + 1)
      expect(row.name).toEqual(expect.any(String))
      expect(row.applied_at).toBeGreaterThan(0)
    }
  })

  it('survives a server restart against the same file — no data lost, no duplicate migration rows (AC-P1-2)', () => {
    const dbPath = tmpDbPath()
    process.env.DATABASE_PATH = dbPath
    initDb()

    const playerId = createSession('Restart-Survivor', 'socket-restart')
    const migrationCountBefore = (getDb()
      .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
      .get() as { count: number }).count

    closeDb()
    initDb()

    const session = getDb()
      .prepare('SELECT player_id FROM sessions WHERE player_id = ?')
      .get(playerId)
    expect(session).toBeDefined()

    const migrationCountAfter = (getDb()
      .prepare('SELECT COUNT(*) AS count FROM schema_migrations')
      .get() as { count: number }).count
    expect(migrationCountAfter).toBe(migrationCountBefore)
  })

  it('only runs newly added migrations when the code ships a higher version (AC-P1-3)', () => {
    const dbPath = tmpDbPath()
    const db = new Database(dbPath)
    db.pragma('foreign_keys = ON')

    const v1Spy = { calls: 0 }
    const v2Spy = { calls: 0 }

    applyMigrations(db, [
      { version: 1, name: 'fake-v1', up: () => { v1Spy.calls++ } },
    ])
    expect(v1Spy.calls).toBe(1)

    applyMigrations(db, [
      { version: 1, name: 'fake-v1', up: () => { v1Spy.calls++ } },
      { version: 2, name: 'fake-v2', up: () => { v2Spy.calls++ } },
    ])

    expect(v1Spy.calls).toBe(1)
    expect(v2Spy.calls).toBe(1)

    db.close()
  })

  it('rolls back a migration that throws midway — no partial schema, no row, error propagates (AC-P1-4)', () => {
    const dbPath = tmpDbPath()
    const db = new Database(dbPath)
    db.pragma('foreign_keys = ON')

    expect(() => applyMigrations(db, [
      {
        version: 1,
        name: 'fake-partial-failure',
        up: (migrationDb) => {
          migrationDb.exec('CREATE TABLE partial_table (id INTEGER PRIMARY KEY)')
          throw new Error('boom')
        },
      },
    ])).toThrow('boom')

    const table = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'partial_table'`)
      .get()
    expect(table).toBeUndefined()

    const migrationRow = db
      .prepare('SELECT * FROM schema_migrations WHERE version = 1')
      .get()
    expect(migrationRow).toBeUndefined()

    db.close()
  })

  it('throws when the DB is at a version higher than the code knows (AC-P1-5)', () => {
    const dbPath = tmpDbPath()
    process.env.DATABASE_PATH = dbPath
    initDb()
    closeDb()

    const db = new Database(dbPath)
    db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)')
      .run(99, 'from-the-future', Date.now())
    db.close()

    expect(() => initDb()).toThrow(/version 99/)
  })

  it('resetDb() throws for a non-test, file-backed DATABASE_PATH; wipes and remigrates for :memory: (AC-P1-6)', () => {
    const dbPath = tmpDbPath()
    process.env.DATABASE_PATH = dbPath
    process.env.NODE_ENV = 'production'
    initDb()

    expect(() => resetDb()).toThrow(/DATABASE_PATH/)

    process.env.NODE_ENV = 'test'
    process.env.DATABASE_PATH = ':memory:'
    initDb()
    createSession('Temp', 'socket-temp')

    resetDb()

    const row = getDb()
      .prepare('SELECT COUNT(*) AS count FROM sessions')
      .get() as { count: number }
    expect(row.count).toBe(0)
  })

  it('throws with a delete-your-dev-db message for a pre-versioning DB (tables exist, no schema_migrations) (AC-P1-7)', () => {
    const dbPath = tmpDbPath()
    const legacyDb = new Database(dbPath)
    legacyDb.exec(`
      CREATE TABLE sessions (
        player_id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
    `)
    legacyDb.close()

    process.env.DATABASE_PATH = dbPath
    expect(() => initDb()).toThrow(/delete/i)
  })
})
