import { describe, expect, it } from 'vitest'
import { EVENTS } from '../events'

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
})
