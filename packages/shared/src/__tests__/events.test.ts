import { describe, expect, it } from 'vitest'
import { EVENTS } from '../events'
import { DEFAULT_ROOM_SETTINGS } from '../types'

describe('eVENTS', () => {
  it('keeps shared socket event names stable', () => {
    expect(EVENTS).toMatchObject({
      SESSION_CREATE: 'session:create',
      SESSION_CREATED: 'session:created',
      ROOM_CREATE: 'room:create',
      ROOM_JOIN: 'room:join',
      ROOM_LEFT: 'room:left',
      ROOM_CLEARED: 'room:cleared',
      GAME_RESULT: 'game:result',
      ERROR: 'error',
    })
  })

  it('has ROOM_SETTINGS_UPDATE and ROOM_SETTINGS_UPDATED events', () => {
    expect(EVENTS.ROOM_SETTINGS_UPDATE).toBe('room:settings_update')
    expect(EVENTS.ROOM_SETTINGS_UPDATED).toBe('room:settings_updated')
  })

  it('has GAME_START event', () => {
    expect(EVENTS.GAME_START).toBe('game:start')
  })

  it('has GAME_SURRENDER event', () => {
    expect(EVENTS.GAME_SURRENDER).toBe('game:surrender')
  })

  it('has GAME_SURRENDERED event', () => {
    expect(EVENTS.GAME_SURRENDERED).toBe('game:surrendered')
  })
})

describe('dEFAULT_ROOM_SETTINGS', () => {
  it('has correct default values', () => {
    expect(DEFAULT_ROOM_SETTINGS).toEqual({
      timerSeconds: 60,
      autoStart: true,
      allowFoul: true,
      showHandStrength: true,
      revealOnSubmit: false,
    })
  })
})
