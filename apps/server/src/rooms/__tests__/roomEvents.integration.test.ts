import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EVENTS } from '@binh-13/shared'
import type { Socket } from 'socket.io-client'
import { createTestServer } from '../../__tests__/helpers/createTestServer'
import {
  createSocketClient,
  waitForEvent,
} from '../../__tests__/helpers/socketClient'

type SessionCreatedPayload = {
  playerId: number
  name: string
}

type RoomPayload = {
  code: string
}

type ErrorPayload = {
  message: string
}

type RoomStatePayload = {
  room: {
    code: string
    players: Array<{ id: number; name: string }>
  }
}

describe('roomEvents integration', () => {
  let port = 0
  let closeServer: (() => Promise<void>) | undefined
  const sockets: Socket[] = []

  beforeEach(async () => {
    const server = await createTestServer()
    port = server.port
    closeServer = server.closeServer
  })

  afterEach(async () => {
    for (const socket of sockets.splice(0)) {
      socket.disconnect()
    }

    await closeServer?.()
  })

  async function connectClient(): Promise<Socket> {
    const socket = createSocketClient(port)
    sockets.push(socket)
    await waitForEvent(socket, 'connect')
    return socket
  }

  async function createSession(socket: Socket, name: string) {
    const created = waitForEvent<SessionCreatedPayload>(
      socket,
      EVENTS.SESSION_CREATED,
    )
    socket.emit(EVENTS.SESSION_CREATE, { name })
    return created
  }

  it('serves health and validates session payloads', async () => {
    const response = await fetch(`http://127.0.0.1:${port}/health`)
    const body = (await response.json()) as {
      status: string
      timestamp: string
    }

    expect(response.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.timestamp).toEqual(expect.any(String))

    const socket = await connectClient()
    const created = await createSession(socket, 'Alice')

    expect(created.playerId).toBeGreaterThan(0)
    expect(created.name).toBe('Alice')

    const invalid = waitForEvent<ErrorPayload>(socket, EVENTS.ERROR)
    socket.emit(EVENTS.SESSION_CREATE, { name: '   ' })

    await expect(invalid).resolves.toEqual({ message: 'Name is required' })

    const disconnectedWithoutSession = await connectClient()
    disconnectedWithoutSession.disconnect()
  })

  it('creates, joins, messages, rejects non-creator clears, and lets the creator clear', async () => {
    const creatorSocket = await connectClient()
    const joinerSocket = await connectClient()
    const creator = await createSession(creatorSocket, 'Creator')
    const joiner = await createSession(joinerSocket, 'Joiner')

    const createdRoom = waitForEvent<RoomPayload>(
      creatorSocket,
      EVENTS.ROOM_CREATED,
    )
    const creatorRoomState = waitForEvent<RoomStatePayload>(
      creatorSocket,
      EVENTS.ROOM_STATE,
    )
    creatorSocket.emit(EVENTS.ROOM_CREATE, { playerId: creator.playerId })

    const room = await createdRoom
    await expect(creatorRoomState).resolves.toMatchObject({
      room: {
        code: room.code,
        players: [{ id: creator.playerId, name: 'Creator' }],
      },
    })

    const joinedRoom = waitForEvent<RoomPayload>(
      joinerSocket,
      EVENTS.ROOM_JOINED,
    )
    const joinedStateCreator = waitForEvent<RoomStatePayload>(
      creatorSocket,
      EVENTS.ROOM_STATE,
    )
    const joinedStateJoiner = waitForEvent<RoomStatePayload>(
      joinerSocket,
      EVENTS.ROOM_STATE,
    )
    joinerSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: joiner.playerId,
      code: room.code.toLowerCase(),
    })

    await expect(joinedRoom).resolves.toEqual({ code: room.code })
    await expect(joinedStateCreator).resolves.toMatchObject({
      room: { code: room.code, players: [{}, {}] },
    })
    await expect(joinedStateJoiner).resolves.toMatchObject({
      room: { code: room.code, players: [{}, {}] },
    })

    const creatorMessage = waitForEvent<{ text: string }>(
      creatorSocket,
      EVENTS.ROOM_MESSAGE,
    )
    const joinerMessage = waitForEvent<{ text: string }>(
      joinerSocket,
      EVENTS.ROOM_MESSAGE,
    )
    creatorSocket.emit(EVENTS.ROOM_MESSAGE, {
      playerId: creator.playerId,
      code: room.code,
      text: 'Ready?',
    })

    await expect(creatorMessage).resolves.toMatchObject({ text: 'Ready?' })
    await expect(joinerMessage).resolves.toMatchObject({ text: 'Ready?' })

    const clearRejected = waitForEvent<ErrorPayload>(joinerSocket, EVENTS.ERROR)
    joinerSocket.emit(EVENTS.ROOM_CLEAR, {
      playerId: joiner.playerId,
      code: room.code,
    })
    await expect(clearRejected).resolves.toEqual({
      message: 'Only the room creator can clear this room',
    })

    const creatorCleared = waitForEvent<RoomPayload>(
      creatorSocket,
      EVENTS.ROOM_CLEARED,
    )
    const joinerCleared = waitForEvent<RoomPayload>(
      joinerSocket,
      EVENTS.ROOM_CLEARED,
    )
    creatorSocket.emit(EVENTS.ROOM_CLEAR, {
      playerId: creator.playerId,
      code: room.code,
    })

    await expect(creatorCleared).resolves.toEqual({ code: room.code })
    await expect(joinerCleared).resolves.toEqual({ code: room.code })
  })

  it('rejects invalid room actions, reports full rooms, emits leave events, and handles disconnects', async () => {
    const creatorSocket = await connectClient()
    const secondSocket = await connectClient()
    const thirdSocket = await connectClient()
    const creator = await createSession(creatorSocket, 'Creator')
    const second = await createSession(secondSocket, 'Second')
    const third = await createSession(thirdSocket, 'Third')

    const roomCreated = waitForEvent<RoomPayload>(
      creatorSocket,
      EVENTS.ROOM_CREATED,
    )
    creatorSocket.emit(EVENTS.ROOM_CREATE, { playerId: creator.playerId })
    const room = await roomCreated

    const secondJoined = waitForEvent<RoomPayload>(
      secondSocket,
      EVENTS.ROOM_JOINED,
    )
    secondSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: second.playerId,
      code: room.code,
    })
    await secondJoined

    const fullRoom = waitForEvent<ErrorPayload>(thirdSocket, EVENTS.ERROR)
    thirdSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: third.playerId,
      code: room.code,
    })
    await expect(fullRoom).resolves.toEqual({
      message: 'Room not found or already full',
    })

    const malformed = waitForEvent<ErrorPayload>(creatorSocket, EVENTS.ERROR)
    creatorSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: creator.playerId,
      code: 'bad',
    })
    await expect(malformed).resolves.toEqual({
      message: 'Room code must be 6 alphanumeric characters',
    })

    const unknownSession = waitForEvent<ErrorPayload>(thirdSocket, EVENTS.ERROR)
    thirdSocket.emit(EVENTS.ROOM_CREATE, { playerId: 999_999 })
    await expect(unknownSession).resolves.toEqual({
      message: 'Session not found',
    })

    const outsiderLeave = waitForEvent<ErrorPayload>(thirdSocket, EVENTS.ERROR)
    thirdSocket.emit(EVENTS.ROOM_LEAVE, {
      playerId: third.playerId,
      code: room.code,
    })
    await expect(outsiderLeave).resolves.toEqual({
      message: 'Player is not in this room',
    })

    const outsiderMessage = waitForEvent<ErrorPayload>(
      thirdSocket,
      EVENTS.ERROR,
    )
    thirdSocket.emit(EVENTS.ROOM_MESSAGE, {
      playerId: third.playerId,
      code: room.code,
      text: 'Can I join?',
    })
    await expect(outsiderMessage).resolves.toEqual({
      message: 'Player is not in this room',
    })

    const missingClear = waitForEvent<ErrorPayload>(creatorSocket, EVENTS.ERROR)
    creatorSocket.emit(EVENTS.ROOM_CLEAR, {
      playerId: creator.playerId,
      code: 'ZZZ999',
    })
    await expect(missingClear).resolves.toEqual({ message: 'Room not found' })

    const roomLeftCreator = waitForEvent<{ playerId: number }>(
      creatorSocket,
      EVENTS.ROOM_LEFT,
    )
    secondSocket.emit(EVENTS.ROOM_LEAVE, {
      playerId: second.playerId,
      code: room.code,
    })
    await expect(roomLeftCreator).resolves.toEqual({
      playerId: second.playerId,
    })

    const rejoined = waitForEvent<RoomPayload>(secondSocket, EVENTS.ROOM_JOINED)
    secondSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: second.playerId,
      code: room.code,
    })
    await expect(rejoined).resolves.toEqual({ code: room.code })

    const disconnectedNotice = waitForEvent<{ playerId: number }>(
      creatorSocket,
      EVENTS.ROOM_LEFT,
    )
    secondSocket.disconnect()
    await expect(disconnectedNotice).resolves.toEqual({
      playerId: second.playerId,
    })
  })

  it('handles ROOM_MESSAGE to a non-existent room and ROOM_LEAVE by the last remaining player', async () => {
    const soloSocket = await connectClient()
    const solo = await createSession(soloSocket, 'Solo')

    const roomCreated = waitForEvent<RoomPayload>(
      soloSocket,
      EVENTS.ROOM_CREATED,
    )
    soloSocket.emit(EVENTS.ROOM_CREATE, { playerId: solo.playerId })
    const room = await roomCreated

    // ROOM_MESSAGE to a room that does not exist — exercises the !room branch
    // (room?.players.find → undefined, not just !player)
    const msgToMissing = waitForEvent<ErrorPayload>(soloSocket, EVENTS.ERROR)
    soloSocket.emit(EVENTS.ROOM_MESSAGE, {
      playerId: solo.playerId,
      code: 'ZZZ000',
      text: 'hello',
    })
    await expect(msgToMissing).resolves.toEqual({
      message: 'Player is not in this room',
    })

    // ROOM_LEAVE as the only player — room is cleared so updatedRoom is undefined
    // (exercises the false branch of `if (updatedRoom) emitRoomState(...)`)
    // The ROOM_LEFT event is emitted to the socket.io room AFTER the socket
    // leaves it, so soloSocket will not receive it. We verify the room was
    // deleted by attempting to rejoin — the server must return an error.
    soloSocket.emit(EVENTS.ROOM_LEAVE, {
      playerId: solo.playerId,
      code: room.code,
    })

    const joinFailed = waitForEvent<ErrorPayload>(soloSocket, EVENTS.ERROR)
    soloSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: solo.playerId,
      code: room.code,
    })
    await expect(joinFailed).resolves.toEqual({
      message: 'Room not found or already full',
    })
  })
})
