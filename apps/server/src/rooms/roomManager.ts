import type { Room } from '@binh-13/shared'
import { getDb } from '../db'
import { logger } from '../lib/logger'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_CODE_LENGTH = 6

type RoomRow = {
  code: string
  status: string
  created_by: number
  created_at: number
}

type PlayerRow = {
  player_id: number
  name: string
  seat: number
  connected: number
}

export type RoomState = {
  code: string
  status: string
  createdBy: number
  players: Array<{
    playerId: number
    name: string
    seat: 1 | 2
    connected: boolean
  }>
}

export function createRoom(createdBy: number): string {
  const db = getDb()
  const code = generateUniqueRoomCode()
  const now = Date.now()

  const create = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO rooms (code, status, created_by, created_at)
      VALUES (?, 'waiting', ?, ?)
    `,
    ).run(code, createdBy, now)

    db.prepare(
      `
      INSERT INTO room_players (room_code, player_id, seat, connected)
      VALUES (?, ?, 1, 1)
    `,
    ).run(code, createdBy)
  })

  create()
  logger.debug({ code, createdBy }, 'Room created')
  return code
}

export function joinRoom(code: string, playerId: number): boolean {
  const db = getDb()
  const normalizedCode = normalizeCode(code)
  const room = getRoom(normalizedCode)

  if (!room) {
    logger.debug({ code: normalizedCode, playerId }, 'Room join rejected: missing room')
    return false
  }

  const existingPlayer = room.players.find((player) => player.playerId === playerId)
  if (existingPlayer) {
    db.prepare(
      `
      UPDATE room_players
      SET connected = 1
      WHERE room_code = ? AND player_id = ?
    `,
    ).run(normalizedCode, playerId)
    logger.debug({ code: normalizedCode, playerId }, 'Room player reconnected')
    return true
  }

  if (room.players.length >= 2) {
    logger.debug({ code: normalizedCode, playerId }, 'Room join rejected: room full')
    return false
  }

  const seat = room.players.some((player) => player.seat === 1) ? 2 : 1

  db.prepare(
    `
    INSERT INTO room_players (room_code, player_id, seat, connected)
    VALUES (?, ?, ?, 1)
  `,
  ).run(normalizedCode, playerId, seat)

  logger.debug({ code: normalizedCode, playerId, seat }, 'Room player joined')
  return true
}

export function leaveRoom(code: string, playerId: number): void {
  const db = getDb()
  const normalizedCode = normalizeCode(code)

  db.prepare(
    `
    UPDATE room_players
    SET connected = 0
    WHERE room_code = ? AND player_id = ?
  `,
  ).run(normalizedCode, playerId)
  logger.debug({ code: normalizedCode, playerId }, 'Room player marked disconnected')

  const connectedCount = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM room_players
      WHERE room_code = ? AND connected = 1
    `,
    )
    .get(normalizedCode) as { count: number } | undefined

  if ((connectedCount?.count ?? 0) === 0) {
    clearRoom(normalizedCode)
  }
}

export function clearRoom(code: string): void {
  const normalizedCode = normalizeCode(code)
  getDb().prepare('DELETE FROM rooms WHERE code = ?').run(normalizedCode)
  logger.debug({ code: normalizedCode }, 'Room cleared')
}

export function getRoom(code: string): RoomState | undefined {
  const db = getDb()
  const normalizedCode = normalizeCode(code)
  const room = db
    .prepare('SELECT code, status, created_by, created_at FROM rooms WHERE code = ?')
    .get(normalizedCode) as RoomRow | undefined

  if (!room) {
    logger.debug({ code: normalizedCode }, 'Room lookup missed')
    return undefined
  }

  const players = db
    .prepare(
      `
      SELECT rp.player_id, s.name, rp.seat, rp.connected
      FROM room_players rp
      JOIN sessions s ON s.player_id = rp.player_id
      WHERE rp.room_code = ?
      ORDER BY rp.seat ASC
    `,
    )
    .all(normalizedCode) as PlayerRow[]

  const roomState = {
    code: room.code,
    status: room.status,
    createdBy: room.created_by,
    players: players.map((player) => ({
      playerId: player.player_id,
      name: player.name,
      seat: toSeat(player.seat),
      connected: player.connected === 1,
    })),
  }

  logger.debug({ code: normalizedCode, players: roomState.players.length }, 'Room lookup hit')
  return roomState
}

export function getRoomByPlayer(playerId: number): RoomState | undefined {
  const row = getDb()
    .prepare(
      `
      SELECT room_code
      FROM room_players
      WHERE player_id = ?
      ORDER BY rowid DESC
      LIMIT 1
    `,
    )
    .get(playerId) as { room_code: string } | undefined

  const room = row ? getRoom(row.room_code) : undefined
  logger.debug({ playerId, found: Boolean(room) }, 'Room lookup by player')
  return room
}

export function toPublicRoom(room: RoomState): Room {
  return {
    code: room.code,
    status: room.status as Room['status'],
    createdBy: room.createdBy,
    players: room.players.map((player) => ({
      id: player.playerId,
      name: player.name,
      seat: player.seat,
      connected: player.connected,
    })),
  }
}

function generateUniqueRoomCode(): string {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateRoomCode()
    if (!getRoom(code)) return code
  }

  throw new Error('Could not generate a unique room code')
}

function generateRoomCode(): string {
  let code = ''
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const index = Math.floor(Math.random() * CODE_ALPHABET.length)
    code += CODE_ALPHABET[index]
  }
  return code
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

function toSeat(seat: number): 1 | 2 {
  return seat === 2 ? 2 : 1
}
