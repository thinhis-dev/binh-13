import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb } from '../../__tests__/helpers/testDb'
import {
  createSession,
  getSession,
  getSessionBySocketId,
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
})
