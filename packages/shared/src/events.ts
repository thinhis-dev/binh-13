/** Default arrangement timer in seconds. Change this single value to adjust game-wide. */
export const GAME_TIMER_SECONDS = 600

// Socket event name constants — always import from here, never use raw strings.
export const EVENTS = {
  SESSION_CREATE: 'session:create',
  SESSION_CREATED: 'session:created',
  SESSION_RESTORE: 'session:restore',
  SESSION_RESTORED: 'session:restored',
  SESSION_RESTORE_FAILED: 'session:restore_failed',
  SESSION_DESTROY: 'session:destroy',
  SESSION_DESTROYED: 'session:destroyed',

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
  GAME_START: 'game:start',
  GAME_SUBMIT: 'game:submit',
  GAME_OPPONENT_SUBMITTED: 'game:opponent_submitted',
  GAME_RESULT: 'game:result',
  GAME_SURRENDER: 'game:surrender',
  GAME_SURRENDERED: 'game:surrendered',

  GAME_REMATCH_REQUEST: 'game:rematch_request',
  GAME_REMATCH_REQUESTED: 'game:rematch_requested',
  GAME_REMATCH_ACCEPTED: 'game:rematch_accepted',
  GAME_REMATCH_DECLINED: 'game:rematch_declined',
  GAME_REMATCH_CANCELLED: 'game:rematch_cancelled',

  ROOM_SETTINGS_UPDATE: 'room:settings_update',
  ROOM_SETTINGS_UPDATED: 'room:settings_updated',

  PROFILE_GET: 'profile:get',
  PROFILE_DATA: 'profile:data',
  PROFILE_UPDATE: 'profile:update',
  PROFILE_UPDATED: 'profile:updated',

  PLAYER_DISCONNECTED: 'player:disconnected',
  PLAYER_RECONNECTED: 'player:reconnected',

  ERROR: 'error',
} as const

export type EventKey = keyof typeof EVENTS
export type EventValue = (typeof EVENTS)[EventKey]
