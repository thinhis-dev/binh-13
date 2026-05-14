/** Default arrangement timer in seconds. Change this single value to adjust game-wide. */
export const GAME_TIMER_SECONDS = 600

// Socket event name constants — always import from here, never use raw strings.
export const EVENTS = {
  SESSION_CREATE: 'session:create',
  SESSION_CREATED: 'session:created',

  ROOM_CREATE: 'room:create',
  ROOM_CREATED: 'room:created',
  ROOM_JOIN: 'room:join',
  ROOM_JOINED: 'room:joined',
  ROOM_LEAVE: 'room:leave',
  ROOM_LEFT: 'room:left',
  ROOM_MESSAGE: 'room:message',
  ROOM_CLEAR: 'room:clear',
  ROOM_CLEARED: 'room:cleared',
  ROOM_REJOIN: 'room:rejoin',
  ROOM_STATE: 'room:state',

  GAME_DEALT: 'game:dealt',
  GAME_TIMER: 'game:timer',
  GAME_SUBMIT: 'game:submit',
  GAME_OPPONENT_SUBMITTED: 'game:opponent_submitted',
  GAME_RESULT: 'game:result',

  PLAYER_DISCONNECTED: 'player:disconnected',
  PLAYER_RECONNECTED: 'player:reconnected',

  ERROR: 'error',
} as const

export type EventKey = keyof typeof EVENTS
export type EventValue = (typeof EVENTS)[EventKey]
