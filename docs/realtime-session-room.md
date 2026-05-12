# Real-time session and room

This milestone implements the first playable real-time lobby slice: guest
sessions, room create/join, lobby state sync, room chat, leave, and clear room.
It does not include card dealing or game-round logic.

## Session model

The current milestone uses a simplified no-JWT identity model:

- `session:create` accepts `{ name }`.
- The server creates a SQLite `sessions` row and returns `{ playerId, name }`.
- The web app persists `playerId`, `name`, and `roomCode` in localStorage through
  Zustand.
- `socket_id` is updated when a known player creates or joins a room from a new
  socket connection.

This intentionally differs from the future JWT model described in `PLAN.md`.

## Room lifecycle

Rooms are two-player lobbies with six-character uppercase codes generated from
an alphabet that avoids ambiguous characters. The creator is inserted as seat 1.
The first joining player is inserted as seat 2.

The server stores room membership in `room_players` with a `connected` flag.
Leaving marks a player disconnected. Clearing a room deletes the room row and
cascades membership rows.

## Socket events

Client-to-server events:

- `session:create` with `{ name }`
- `room:create` with `{ playerId }`
- `room:join` with `{ playerId, code }`
- `room:leave` with `{ playerId, code }`
- `room:message` with `{ playerId, code, text }`
- `room:clear` with `{ playerId, code }`

Server-to-client events:

- `session:created` with `{ playerId, name }`
- `room:created` with `{ code }`
- `room:joined` with `{ code }`
- `room:state` with `{ room }`
- `room:message` with `{ playerId, name, text, at }`
- `room:left` with `{ playerId }`
- `room:cleared` with `{ code }`
- `error` with `{ message }`

All incoming event payloads are validated with Zod in
`apps/server/src/rooms/roomEvents.ts` before DB managers are called.

## Database tables

The dev schema is reset on server start for this milestone.

- `sessions`: integer `player_id`, `name`, current `socket_id`, `created_at`
- `rooms`: `code`, `status`, `created_by`, `created_at`
- `room_players`: `room_code`, `player_id`, `seat`, `connected`

The prior `hands` and `arrangements` tables are removed from this dev schema
until the card-game phase adds them back with the final shape.

## Client flow

`Home.tsx` creates a session, then allows room creation or joining. The socket
singleton is lazy and does not connect on import. `Lobby.tsx` subscribes to room
state and message events, renders both seat slots, and exposes message, leave,
and creator-only clear actions.

## Known limits

- There is no JWT or server-side proof that a persisted `playerId` belongs to a
  browser.
- Room state is intentionally minimal and does not yet include hands, submitted
  status, timers, or result data.
- The database reset strategy is development-only and should be replaced by
  versioned migrations before production data matters.
