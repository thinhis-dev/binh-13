import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb } from '../../__tests__/helpers/testDb'
import { getDb } from '../../db'
import {
  createSession,
  deleteSession,
  getPlayer,
  getSession,
  getSessionBySocketId,
  restoreSession,
  updatePlayer,
  updateSocketId,
} from '../sessionManager'

describe('sessionManager', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('creates, reads, and updates sessions', () => {
    const playerId = createSession('Binh', 'socket-a')

    expect(playerId).toBeGreaterThan(0)
    expect(getSession(playerId)).toEqual({
      playerId,
      name: 'Binh',
      socketId: 'socket-a',
    })
    expect(getSessionBySocketId('socket-a')).toEqual({
      playerId,
      name: 'Binh',
    })

    updateSocketId(playerId, 'socket-b')

    expect(getSession(playerId)?.socketId).toBe('socket-b')
    expect(getSessionBySocketId('socket-a')).toBeUndefined()
    expect(getSessionBySocketId('socket-b')).toEqual({
      playerId,
      name: 'Binh',
    })
  })

  it('returns undefined for missing sessions', () => {
    expect(getSession(999)).toBeUndefined()
    expect(getSessionBySocketId('missing')).toBeUndefined()
  })

  it('splits identity across two tables: the players row survives session deletion', () => {
    const playerId = createSession('Binh', 'socket-a')

    expect(getPlayer(playerId)).toMatchObject({
      playerId,
      name: 'Binh',
      avatar: 'default',
    })

    deleteSession(playerId)

    // The ephemeral session is gone...
    expect(getSession(playerId)).toBeUndefined()
    // ...but the durable player identity is not.
    expect(getPlayer(playerId)).toMatchObject({ playerId, name: 'Binh' })
  })

  it('restoreSession revives a session for an existing player and bumps last_seen_at', () => {
    const playerId = createSession('Binh', 'socket-a')
    deleteSession(playerId)
    expect(getSession(playerId)).toBeUndefined()

    const before = getPlayer(playerId)!.lastSeenAt

    const restored = restoreSession(playerId, 'socket-b')

    expect(restored).toMatchObject({ playerId, name: 'Binh' })
    expect(restored!.lastSeenAt).toBeGreaterThanOrEqual(before)
    expect(getSession(playerId)).toEqual({
      playerId,
      name: 'Binh',
      socketId: 'socket-b',
    })
  })

  it('restoreSession returns undefined for a player that does not exist', () => {
    expect(restoreSession(999_999, 'socket-x')).toBeUndefined()
  })

  it('updatePlayer changes name/avatar and leaves the row intact otherwise', () => {
    const playerId = createSession('Binh', 'socket-a')

    updatePlayer(playerId, { name: 'Updated', avatar: 'fox' })

    expect(getPlayer(playerId)).toMatchObject({
      playerId,
      name: 'Updated',
      avatar: 'fox',
    })
  })

  it('updatePlayer is a no-op for a non-existent player', () => {
    expect(() => updatePlayer(999_999, { name: 'Nobody' })).not.toThrow()
  })

  it('rooms/room_players/hands/arrangements reference players(id), not sessions', () => {
    const db = getDb()
    const foreignKeys = db.prepare('PRAGMA foreign_key_list(rooms)').all() as Array<{ table: string }>
    expect(foreignKeys.some(fk => fk.table === 'players')).toBe(true)
  })
})
