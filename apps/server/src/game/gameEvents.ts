import type { Card, PlayerArrangement } from '@binh-13/shared'
import type { Server } from 'socket.io'
import { EVENTS, GAME_TIMER_SECONDS, RANK_VALUE } from '@binh-13/shared'
import { z } from 'zod'
import { getDb } from '../db'
import { createChildLogger } from '../lib/logger'
import { getRoom, getRoomSettings, updateRoomStatus } from '../rooms/roomManager'
import { getSession } from '../session/sessionManager'
import { compareRound } from './compareRound'
import { compareFiveCard } from './evaluator'
import { validateArrangement } from './foulCheck'
import {
  allSubmitted,
  endGame,
  getGame,
  getPlayerIds,
  startGame,
  submitArrangement,
} from './gameManager'

const log = createChildLogger({ module: 'gameEvents' })

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const cardSchema = z.object({
  id: z.string().regex(/^[2-9TJQKA][SHDC]$/, 'Invalid card id format'),
  rank: z.enum([
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    'T',
    'J',
    'Q',
    'K',
    'A',
  ]),
  suit: z.enum(['S', 'H', 'D', 'C']),
})

const roomCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{6}$/i)
  .transform(c => c.toUpperCase())

const gameSubmitSchema = z.object({
  playerId: z.number().int().positive(),
  code: roomCodeSchema,
  arrangement: z.object({
    group1: z.array(cardSchema).length(5),
    group2: z.array(cardSchema).length(5),
    group3: z.array(cardSchema).length(3),
  }),
})

const gameSurrenderSchema = z.object({
  playerId: z.number().int().positive(),
  code: roomCodeSchema,
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Ensures every card in the submitted arrangement belongs to the dealt hand
 * and that there are no duplicates.
 */
export function validateSubmittedCards(
  dealtHand: Card[],
  arrangement: {
    group1: Card[]
    group2: Card[]
    group3: Card[]
  },
): boolean {
  const submitted = [
    ...arrangement.group1,
    ...arrangement.group2,
    ...arrangement.group3,
  ]
  if (submitted.length !== 13)
    return false

  const submittedIds = new Set(submitted.map(c => c.id))
  if (submittedIds.size !== 13)
    return false // duplicates

  const dealtIds = new Set(dealtHand.map(c => c.id))
  for (const id of submittedIds) {
    if (!dealtIds.has(id))
      return false
  }
  return true
}

/** Creates a forfeit arrangement guaranteed to foul (group2 > group1). */
export function createForfeitArrangement(
  playerId: number,
  hand: Card[],
): PlayerArrangement {
  // Sort descending so highest-value cards come first
  const sorted = [...hand].sort(
    (a, b) => (RANK_VALUE[b.rank] ?? 0) - (RANK_VALUE[a.rank] ?? 0),
  )
  const group3 = sorted.slice(10, 13) as PlayerArrangement['group3']

  // Put top 5 cards in group2 (middle) and next 5 in group1 (back)
  // → group1 is weaker than group2 → foul in most cases
  let group1 = sorted.slice(5, 10) as PlayerArrangement['group1']
  let group2 = sorted.slice(0, 5) as PlayerArrangement['group2']

  // Verify with pokersolver — if rank-sorting didn't produce a foul
  // (e.g. weaker-ranked cards formed a flush/straight), swap the groups
  if (compareFiveCard(group1, group2) >= 0) {
    ;[group1, group2] = [
      group2 as unknown as PlayerArrangement['group1'],
      group1 as unknown as PlayerArrangement['group2'],
    ]
  }

  return { playerId, group1, group2, group3 }
}

/** Resolves the round using both submitted arrangements, emits game:result. */
function resolveRound(
  io: Server,
  roomCode: string,
  p1Arr: PlayerArrangement,
  p2Arr: PlayerArrangement,
): void {
  const game = getGame(roomCode)
  if (!game)
    return

  game.status = 'comparing'
  if (game.timerHandle !== null) {
    clearInterval(game.timerHandle)
    game.timerHandle = null
  }

  const result = compareRound(p1Arr, p2Arr)

  // Persist arrangements
  const db = getDb()
  db.prepare(
    `INSERT OR REPLACE INTO arrangements (room_code, player_id, arrangement_json, submitted_at)
     VALUES (?, ?, ?, ?)`,
  ).run(roomCode, p1Arr.playerId, JSON.stringify(p1Arr), Date.now())
  db.prepare(
    `INSERT OR REPLACE INTO arrangements (room_code, player_id, arrangement_json, submitted_at)
     VALUES (?, ?, ?, ?)`,
  ).run(roomCode, p2Arr.playerId, JSON.stringify(p2Arr), Date.now())

  updateRoomStatus(roomCode, 'finished')
  io.to(roomCode).emit(EVENTS.GAME_RESULT, result)

  game.status = 'finished'
  endGame(roomCode)
  log.info({ roomCode, winner: result.winner }, 'Round resolved')
}

/** Starts the countdown timer and auto-resolves on expiry. */
function startTimer(io: Server, roomCode: string): void {
  const game = getGame(roomCode)
  if (!game)
    return

  let secondsLeft = game.timerSeconds

  game.timerHandle = setInterval(() => {
    secondsLeft--
    io.to(roomCode).emit(EVENTS.GAME_TIMER, { secondsLeft })

    if (secondsLeft <= 0) {
      if (game.timerHandle !== null) {
        clearInterval(game.timerHandle)
        game.timerHandle = null
      }
      handleTimerExpiry(io, roomCode)
    }
  }, 1000)
}

/** Handles timer expiry: auto-forfeits non-submitters and resolves the round. */
export function handleTimerExpiry(io: Server, roomCode: string): void {
  const game = getGame(roomCode)
  if (!game || game.status !== 'arranging')
    return

  const ids = getPlayerIds(roomCode)
  if (!ids)
    return
  const [p1Id, p2Id] = ids

  const p1Sub
    = game.submissions.get(p1Id)
      ?? createForfeitArrangement(p1Id, game.hands.get(p1Id)!)
  const p2Sub
    = game.submissions.get(p2Id)
      ?? createForfeitArrangement(p2Id, game.hands.get(p2Id)!)

  log.info({ roomCode }, 'Timer expired — auto-resolving round')
  resolveRound(io, roomCode, p1Sub, p2Sub)
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Called from roomEvents when the 2nd player joins.
 * Deals cards, starts the timer, and emits game:dealt to each player separately.
 */
export function triggerGameStart(
  io: Server,
  roomCode: string,
  players: Array<{ playerId: number, seat: 1 | 2 }>,
  timerSeconds?: number,
): void {
  if (players.length !== 2)
    return

  const sorted = [...players].sort((a, b) => a.seat - b.seat)
  const p1Id = sorted[0].playerId
  const p2Id = sorted[1].playerId

  const game = startGame(
    roomCode,
    [p1Id, p2Id],
    timerSeconds ?? GAME_TIMER_SECONDS,
  )
  updateRoomStatus(roomCode, 'arranging')

  // Persist dealt hands
  const db = getDb()
  db.prepare(
    `INSERT OR REPLACE INTO hands (room_code, player_id, cards_json) VALUES (?, ?, ?)`,
  ).run(roomCode, p1Id, JSON.stringify(game.hands.get(p1Id)))
  db.prepare(
    `INSERT OR REPLACE INTO hands (room_code, player_id, cards_json) VALUES (?, ?, ?)`,
  ).run(roomCode, p2Id, JSON.stringify(game.hands.get(p2Id)))

  // Emit to each player individually — never send opponent's cards
  const p1Socket = getSocketIdForPlayer(io, p1Id)
  const p2Socket = getSocketIdForPlayer(io, p2Id)

  if (p1Socket) {
    io.to(p1Socket).emit(EVENTS.GAME_DEALT, {
      hand: game.hands.get(p1Id),
      timerSeconds: game.timerSeconds,
    })
  }
  if (p2Socket) {
    io.to(p2Socket).emit(EVENTS.GAME_DEALT, {
      hand: game.hands.get(p2Id),
      timerSeconds: game.timerSeconds,
    })
  }

  startTimer(io, roomCode)

  log.info({ roomCode, p1Id, p2Id }, 'Game started — cards dealt')
}

/** Registers the game:submit handler for new socket connections. */
export function registerGameEvents(io: Server): void {
  io.on('connection', (socket) => {
    socket.on(EVENTS.GAME_SUBMIT, (payload) => {
      const parsed = gameSubmitSchema.safeParse(payload)
      if (!parsed.success) {
        socket.emit(EVENTS.ERROR, {
          message: parsed.error.issues[0]?.message ?? 'Invalid payload',
        })
        return
      }

      const { playerId, code, arrangement } = parsed.data

      const session = getSession(playerId)
      if (!session) {
        socket.emit(EVENTS.ERROR, { message: 'Session not found' })
        return
      }

      const room = getRoom(code)
      if (!room) {
        socket.emit(EVENTS.ERROR, { message: 'Room not found' })
        return
      }

      if (!room.players.some(p => p.playerId === playerId)) {
        socket.emit(EVENTS.ERROR, { message: 'Not in this room' })
        return
      }

      const game = getGame(code)
      if (!game || game.status !== 'arranging') {
        socket.emit(EVENTS.ERROR, { message: 'Game not in progress' })
        return
      }

      if (game.submissions.has(playerId)) {
        socket.emit(EVENTS.ERROR, { message: 'Already submitted' })
        return
      }

      const dealtHand = game.hands.get(playerId)
      if (!dealtHand) {
        socket.emit(EVENTS.ERROR, { message: 'No hand found for player' })
        return
      }

      if (!validateSubmittedCards(dealtHand, arrangement)) {
        log.warn(
          { playerId, code },
          'Card validation failed — possible cheating',
        )
        socket.emit(EVENTS.ERROR, { message: 'Invalid cards in arrangement' })
        return
      }

      const fullArrangement: PlayerArrangement = {
        playerId,
        group1: arrangement.group1 as PlayerArrangement['group1'],
        group2: arrangement.group2 as PlayerArrangement['group2'],
        group3: arrangement.group3 as PlayerArrangement['group3'],
      }

      // Check allowFoul room setting
      const roomSettings = getRoomSettings(code)
      if (!roomSettings.allowFoul && !validateArrangement(fullArrangement)) {
        log.warn({ playerId, code }, 'Foul arrangement rejected by room settings')
        socket.emit(EVENTS.ERROR, { message: 'Foul arrangements are not allowed in this room' })
        return
      }

      const accepted = submitArrangement(code, playerId, fullArrangement)
      if (!accepted) {
        socket.emit(EVENTS.ERROR, { message: 'Submission rejected' })
        return
      }

      log.info({ playerId, code }, 'Arrangement submitted')

      // Notify opponent
      const ids = getPlayerIds(code)
      if (ids) {
        const opponentId = ids[0] === playerId ? ids[1] : ids[0]
        const opponentSocket = getSocketIdForPlayer(io, opponentId)
        if (opponentSocket) {
          io.to(opponentSocket).emit(EVENTS.GAME_OPPONENT_SUBMITTED, {})
        }
      }

      if (allSubmitted(code)) {
        const p1Id = ids![0]
        const p2Id = ids![1]
        resolveRound(
          io,
          code,
          game.submissions.get(p1Id)!,
          game.submissions.get(p2Id)!,
        )
      }
    })

    socket.on(EVENTS.GAME_SURRENDER, (payload) => {
      const parsed = gameSurrenderSchema.safeParse(payload)
      if (!parsed.success) {
        socket.emit(EVENTS.ERROR, {
          message: parsed.error.issues[0]?.message ?? 'Invalid payload',
        })
        return
      }

      const { playerId, code } = parsed.data

      const session = getSession(playerId)
      if (!session) {
        socket.emit(EVENTS.ERROR, { message: 'Session not found' })
        return
      }

      const room = getRoom(code)
      if (!room) {
        socket.emit(EVENTS.ERROR, { message: 'Room not found' })
        return
      }

      if (!room.players.some(p => p.playerId === playerId)) {
        socket.emit(EVENTS.ERROR, { message: 'Not in this room' })
        return
      }

      const game = getGame(code)
      if (!game || game.status !== 'arranging') {
        socket.emit(EVENTS.ERROR, { message: 'No active game' })
        return
      }

      if (game.submissions.has(playerId)) {
        socket.emit(EVENTS.ERROR, { message: 'Cannot surrender after submitting' })
        return
      }

      handleSurrender(io, code, playerId)
    })
  })
}

/**
 * Resolves a game by surrender.
 * The surrendering player loses all 3 groups; their opponent wins.
 * Emits GAME_SURRENDERED then GAME_RESULT to the room.
 */
export function handleSurrender(
  io: Server,
  roomCode: string,
  surrenderingPlayerId: number,
): void {
  const game = getGame(roomCode)
  if (!game || game.status !== 'arranging')
    return

  const ids = getPlayerIds(roomCode)
  if (!ids)
    return

  const [p1Id, p2Id] = ids
  const isP1 = surrenderingPlayerId === p1Id
  const winner: 'p1' | 'p2' = isP1 ? 'p2' : 'p1'

  // Stop the timer
  if (game.timerHandle !== null) {
    clearInterval(game.timerHandle)
    game.timerHandle = null
  }

  game.status = 'comparing'

  // Build arrangements: surrenderer gets forfeit, opponent keeps their submission
  const surrendererHand = game.hands.get(surrenderingPlayerId)!
  const surrendererArr = createForfeitArrangement(surrenderingPlayerId, surrendererHand)

  const opponentId = isP1 ? p2Id : p1Id
  const opponentArr
    = game.submissions.get(opponentId)
      ?? createForfeitArrangement(opponentId, game.hands.get(opponentId)!)

  const p1Arr: PlayerArrangement = isP1 ? surrendererArr : opponentArr
  const p2Arr: PlayerArrangement = isP1 ? opponentArr : surrendererArr

  // Build a surrender result — surrenderer loses all 3 groups
  const surrenderGroup = {
    result: winner,
    p1Hand: isP1 ? 'Surrender' : 'Win',
    p2Hand: isP1 ? 'Win' : 'Surrender',
    p1Foul: false,
    p2Foul: false,
  } as const

  const result = {
    group1: surrenderGroup,
    group2: surrenderGroup,
    group3: surrenderGroup,
    winner,
    p1Score: isP1 ? 0 : 3,
    p2Score: isP1 ? 3 : 0,
    p1Foul: false,
    p2Foul: false,
    arrangements: {
      p1: p1Arr,
      p2: p2Arr,
    },
    surrendered: true,
    surrenderedBy: surrenderingPlayerId,
  }

  // Persist arrangements
  const db = getDb()
  db.prepare(
    `INSERT OR REPLACE INTO arrangements (room_code, player_id, arrangement_json, submitted_at)
     VALUES (?, ?, ?, ?)`,
  ).run(roomCode, p1Arr.playerId, JSON.stringify(p1Arr), Date.now())
  db.prepare(
    `INSERT OR REPLACE INTO arrangements (room_code, player_id, arrangement_json, submitted_at)
     VALUES (?, ?, ?, ?)`,
  ).run(roomCode, p2Arr.playerId, JSON.stringify(p2Arr), Date.now())

  updateRoomStatus(roomCode, 'finished')

  io.to(roomCode).emit(EVENTS.GAME_SURRENDERED, {
    surrenderedBy: surrenderingPlayerId,
    winner,
  })
  io.to(roomCode).emit(EVENTS.GAME_RESULT, result)

  game.status = 'finished'
  endGame(roomCode)

  log.info({ roomCode, surrenderingPlayerId, winner }, 'Game resolved by surrender')
}

/** Helper to find the current socket ID for a player. */
function getSocketIdForPlayer(
  io: Server,
  playerId: number,
): string | undefined {
  const session = getSession(playerId)
  return session?.socketId || undefined
}
