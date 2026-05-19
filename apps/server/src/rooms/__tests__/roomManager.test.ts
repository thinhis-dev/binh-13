import { DEFAULT_ROOM_SETTINGS } from '@binh-13/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetTestDb } from '../../__tests__/helpers/testDb'
import { createSession } from '../../session/sessionManager'
import {
  clearRoom,
  createRoom,
  getRoom,
  getRoomByPlayer,
  getRoomSettings,
  joinRoom,
  leaveRoom,
  toPublicRoom,
  updateRoomSettings,
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
      settings: DEFAULT_ROOM_SETTINGS,
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
      settings: DEFAULT_ROOM_SETTINGS,
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

describe('roomSettings', () => {
  beforeEach(() => {
    resetTestDb()
  })

  it('getRoomSettings returns DEFAULT_ROOM_SETTINGS when no settings stored', () => {
    const creatorId = createSession('Creator', 'socket-creator')
    const code = createRoom(creatorId)

    const settings = getRoomSettings(code)
    expect(settings).toEqual(DEFAULT_ROOM_SETTINGS)
  })

  it('getRoomSettings merges stored partial settings over defaults', () => {
    const creatorId = createSession('Creator', 'socket-creator')
    const code = createRoom(creatorId)

    updateRoomSettings(code, { timerSeconds: 120, allowFoul: false })

    const settings = getRoomSettings(code)
    expect(settings).toEqual({
      ...DEFAULT_ROOM_SETTINGS,
      timerSeconds: 120,
      allowFoul: false,
    })
  })

  it('updateRoomSettings saves merged result and returns full settings', () => {
    const creatorId = createSession('Creator', 'socket-creator')
    const code = createRoom(creatorId)

    const result = updateRoomSettings(code, { timerSeconds: 30, autoStart: false })
    expect(result).toEqual({
      ...DEFAULT_ROOM_SETTINGS,
      timerSeconds: 30,
      autoStart: false,
    })

    // Re-read to confirm persistence
    expect(getRoomSettings(code)).toEqual({
      ...DEFAULT_ROOM_SETTINGS,
      timerSeconds: 30,
      autoStart: false,
    })
  })

  it('updateRoomSettings with empty object changes nothing', () => {
    const creatorId = createSession('Creator', 'socket-creator')
    const code = createRoom(creatorId)

    const result = updateRoomSettings(code, {})
    expect(result).toEqual(DEFAULT_ROOM_SETTINGS)
  })

  it('getRoom includes settings in returned state', () => {
    const creatorId = createSession('Creator', 'socket-creator')
    const code = createRoom(creatorId)

    updateRoomSettings(code, { revealOnSubmit: true })

    const room = getRoom(code)
    expect(room?.settings).toEqual({
      ...DEFAULT_ROOM_SETTINGS,
      revealOnSubmit: true,
    })
  })

  it('toPublicRoom includes settings', () => {
    const creatorId = createSession('Creator', 'socket-creator')
    const code = createRoom(creatorId)

    updateRoomSettings(code, { showHandStrength: false })

    const room = getRoom(code)!
    const publicRoom = toPublicRoom(room)

    expect(publicRoom.settings).toEqual({
      ...DEFAULT_ROOM_SETTINGS,
      showHandStrength: false,
    })
  })

  it('getRoomSettings returns DEFAULT_ROOM_SETTINGS for unknown code gracefully', () => {
    // Unknown room code — should return defaults (not throw)
    const settings = getRoomSettings('XXXXXX')
    expect(settings).toEqual(DEFAULT_ROOM_SETTINGS)
  })
})
