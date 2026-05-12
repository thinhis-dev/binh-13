import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb } from '../../__tests__/helpers/testDb'
import { createSession } from '../../session/sessionManager'
import {
  clearRoom,
  createRoom,
  getRoom,
  getRoomByPlayer,
  joinRoom,
  leaveRoom,
  toPublicRoom,
} from '../roomManager'

describe('roomManager', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('creates rooms and exposes public state', () => {
    const creatorId = createSession('Creator', 'socket-creator')
    const code = createRoom(creatorId)
    const room = getRoom(code)

    expect(code).toHaveLength(6)
    expect(room).toEqual({
      code,
      status: 'waiting',
      createdBy: creatorId,
      players: [
        {
          playerId: creatorId,
          name: 'Creator',
          seat: 1,
          connected: true,
        },
      ],
    })
    expect(room ? toPublicRoom(room) : undefined).toEqual({
      code,
      status: 'waiting',
      createdBy: creatorId,
      players: [
        {
          id: creatorId,
          name: 'Creator',
          seat: 1,
          connected: true,
        },
      ],
    })
    expect(getRoomByPlayer(creatorId)?.code).toBe(code)
  })

  it('joins, reconnects, and rejects missing or full rooms', () => {
    const creatorId = createSession('Creator', 'socket-creator')
    const secondId = createSession('Second', 'socket-second')
    const thirdId = createSession('Third', 'socket-third')
    const code = createRoom(creatorId)

    expect(joinRoom('missing', secondId)).toBe(false)
    expect(joinRoom(` ${code.toLowerCase()} `, secondId)).toBe(true)
    expect(joinRoom(code, secondId)).toBe(true)
    expect(joinRoom(code, thirdId)).toBe(false)

    expect(getRoom(code)?.players).toEqual([
      {
        playerId: creatorId,
        name: 'Creator',
        seat: 1,
        connected: true,
      },
      {
        playerId: secondId,
        name: 'Second',
        seat: 2,
        connected: true,
      },
    ])
  })

  it('marks players disconnected, preserves active rooms, and clears empty rooms', () => {
    const creatorId = createSession('Creator', 'socket-creator')
    const secondId = createSession('Second', 'socket-second')
    const code = createRoom(creatorId)

    joinRoom(code, secondId)
    leaveRoom(code, secondId)

    expect(getRoom(code)?.players[1]).toMatchObject({
      playerId: secondId,
      connected: false,
    })

    leaveRoom(code, creatorId)
    expect(getRoom(code)).toBeUndefined()
  })

  it('clears rooms explicitly and returns undefined when no room matches a player', () => {
    const creatorId = createSession('Creator', 'socket-creator')
    const code = createRoom(creatorId)

    clearRoom(code.toLowerCase())

    expect(getRoom(code)).toBeUndefined()
    expect(getRoomByPlayer(creatorId)).toBeUndefined()
  })

  // NOTE: generateUniqueRoomCode() throws after 20 collision attempts.
  // This path is only reachable when every generated code already exists in the
  // DB, which requires controlling Math.random. It is intentionally left
  // uncovered — the defensive guard exists for correctness, not exercisability.
})
