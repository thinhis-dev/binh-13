import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { closeDb, getDb, initDb, resetDb } from '../db'
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
