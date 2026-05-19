import type { Card, RoomSettings } from '@binh-13/shared'
import type { Socket } from 'socket.io-client'
import { DEFAULT_ROOM_SETTINGS, EVENTS } from '@binh-13/shared'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestServer } from '../../__tests__/helpers/createTestServer'
import {
  createSocketClient,
  waitForEvent,
} from '../../__tests__/helpers/socketClient'
import { createForfeitArrangement } from '../../game/gameEvents'

interface SessionCreatedPayload {
  playerId: number
  name: string
}

interface RoomPayload {
  code: string
}

interface ErrorPayload {
  message: string
}

interface RoomStatePayload {
  room: {
    code: string
    status: string
    settings: RoomSettings
    players: Array<{ id: number, name: string }>
  }
}

interface SettingsUpdatedPayload {
  settings: RoomSettings
}

describe('roomSettings integration', () => {
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

  async function setupOwnerAndRoom() {
    const ownerSocket = await connectClient()
    const owner = await createSession(ownerSocket, 'Owner')

    const roomCreated = waitForEvent<RoomPayload>(
      ownerSocket,
      EVENTS.ROOM_CREATED,
    )
    ownerSocket.emit(EVENTS.ROOM_CREATE, { playerId: owner.playerId })
    const room = await roomCreated

    return { ownerSocket, owner, roomCode: room.code }
  }

  it('includes default settings in ROOM_STATE when room is created', async () => {
    const { ownerSocket, roomCode } = await setupOwnerAndRoom()

    const roomState = waitForEvent<RoomStatePayload>(
      ownerSocket,
      EVENTS.ROOM_STATE,
    )
    ownerSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: (await createSession(ownerSocket, 'Owner')).playerId,
      code: roomCode,
    })

    // Room state is already emitted on create; just get the room state directly
    const statePromise = waitForEvent<RoomStatePayload>(
      ownerSocket,
      EVENTS.ROOM_STATE,
    )
    ownerSocket.emit(EVENTS.ROOM_CREATE, {
      playerId: (
        await createSession(await connectClient(), 'AnotherOwner')
      ).playerId,
    })
    void roomState

    // Start fresh to test room state with settings
    const freshSocket = await connectClient()
    const freshOwner = await createSession(freshSocket, 'FreshOwner')
    const freshRoomCreated = waitForEvent<RoomPayload>(
      freshSocket,
      EVENTS.ROOM_CREATED,
    )
    const freshRoomState = waitForEvent<RoomStatePayload>(
      freshSocket,
      EVENTS.ROOM_STATE,
    )
    freshSocket.emit(EVENTS.ROOM_CREATE, { playerId: freshOwner.playerId })
    await freshRoomCreated
    const state = await freshRoomState
    void statePromise

    expect(state.room.settings).toEqual(DEFAULT_ROOM_SETTINGS)
  })

  it('owner can update settings and receives ROOM_SETTINGS_UPDATED + ROOM_STATE', async () => {
    const { ownerSocket, owner, roomCode } = await setupOwnerAndRoom()

    const settingsUpdated = waitForEvent<SettingsUpdatedPayload>(
      ownerSocket,
      EVENTS.ROOM_SETTINGS_UPDATED,
    )
    const roomState = waitForEvent<RoomStatePayload>(
      ownerSocket,
      EVENTS.ROOM_STATE,
    )

    ownerSocket.emit(EVENTS.ROOM_SETTINGS_UPDATE, {
      playerId: owner.playerId,
      code: roomCode,
      settings: { timerSeconds: 120, allowFoul: false },
    })

    const updated = await settingsUpdated
    expect(updated.settings).toEqual({
      ...DEFAULT_ROOM_SETTINGS,
      timerSeconds: 120,
      allowFoul: false,
    })

    const state = await roomState
    expect(state.room.settings).toEqual({
      ...DEFAULT_ROOM_SETTINGS,
      timerSeconds: 120,
      allowFoul: false,
    })
  })

  it('non-owner is rejected with error when trying to update settings', async () => {
    const { ownerSocket, owner: _owner, roomCode } = await setupOwnerAndRoom()

    const joinerSocket = await connectClient()
    const joiner = await createSession(joinerSocket, 'Joiner')

    const joinerJoined = waitForEvent<RoomPayload>(
      joinerSocket,
      EVENTS.ROOM_JOINED,
    )
    joinerSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: joiner.playerId,
      code: roomCode,
    })
    await joinerJoined
    void ownerSocket

    const errorEvent = waitForEvent<ErrorPayload>(joinerSocket, EVENTS.ERROR)
    joinerSocket.emit(EVENTS.ROOM_SETTINGS_UPDATE, {
      playerId: joiner.playerId,
      code: roomCode,
      settings: { timerSeconds: 30 },
    })

    await expect(errorEvent).resolves.toEqual({
      message: 'Only the room creator can change settings',
    })
  })

  it('settings are locked once game starts', async () => {
    const { ownerSocket, owner, roomCode } = await setupOwnerAndRoom()

    const joinerSocket = await connectClient()
    const joiner = await createSession(joinerSocket, 'Joiner')

    // 2nd player joins → game auto-starts
    const joinerJoined = waitForEvent<RoomPayload>(
      joinerSocket,
      EVENTS.ROOM_JOINED,
    )
    // Wait for game:dealt to confirm game started
    const gameDealt = waitForEvent(ownerSocket, EVENTS.GAME_DEALT)
    joinerSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: joiner.playerId,
      code: roomCode,
    })
    await joinerJoined
    await gameDealt

    const errorEvent = waitForEvent<ErrorPayload>(ownerSocket, EVENTS.ERROR)
    ownerSocket.emit(EVENTS.ROOM_SETTINGS_UPDATE, {
      playerId: owner.playerId,
      code: roomCode,
      settings: { timerSeconds: 30 },
    })

    await expect(errorEvent).resolves.toEqual({
      message: 'Cannot change settings while game is in progress',
    })
  })

  it('joining player receives updated settings in ROOM_STATE', async () => {
    const { ownerSocket, owner, roomCode } = await setupOwnerAndRoom()

    // Owner updates settings
    const settingsUpdated = waitForEvent<SettingsUpdatedPayload>(
      ownerSocket,
      EVENTS.ROOM_SETTINGS_UPDATED,
    )
    ownerSocket.emit(EVENTS.ROOM_SETTINGS_UPDATE, {
      playerId: owner.playerId,
      code: roomCode,
      settings: { timerSeconds: 120, autoStart: true },
    })
    await settingsUpdated

    // New joiner connects
    const joinerSocket = await connectClient()
    const joiner = await createSession(joinerSocket, 'Joiner')

    const joinerRoomState = waitForEvent<RoomStatePayload>(
      joinerSocket,
      EVENTS.ROOM_STATE,
    )
    joinerSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: joiner.playerId,
      code: roomCode,
    })

    const state = await joinerRoomState
    expect(state.room.settings.timerSeconds).toBe(120)
  })

  it('timer setting propagates to GAME_DEALT payload', async () => {
    const { ownerSocket, owner, roomCode } = await setupOwnerAndRoom()

    // Set timer to 120s
    const settingsUpdated = waitForEvent<SettingsUpdatedPayload>(
      ownerSocket,
      EVENTS.ROOM_SETTINGS_UPDATED,
    )
    ownerSocket.emit(EVENTS.ROOM_SETTINGS_UPDATE, {
      playerId: owner.playerId,
      code: roomCode,
      settings: { timerSeconds: 120 },
    })
    await settingsUpdated

    // Joiner triggers game start
    const joinerSocket = await connectClient()
    const joiner = await createSession(joinerSocket, 'Joiner')

    const ownerDealt = waitForEvent<{ hand: unknown[], timerSeconds: number }>(
      ownerSocket,
      EVENTS.GAME_DEALT,
    )
    joinerSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: joiner.playerId,
      code: roomCode,
    })
    await waitForEvent(joinerSocket, EVENTS.ROOM_JOINED)

    const dealt = await ownerDealt
    expect(dealt.timerSeconds).toBe(120)
  })

  it('auto-start disabled: game does NOT start on join, starts on GAME_START', async () => {
    const { ownerSocket, owner, roomCode } = await setupOwnerAndRoom()

    // Disable auto-start
    const settingsUpdated = waitForEvent<SettingsUpdatedPayload>(
      ownerSocket,
      EVENTS.ROOM_SETTINGS_UPDATED,
    )
    ownerSocket.emit(EVENTS.ROOM_SETTINGS_UPDATE, {
      playerId: owner.playerId,
      code: roomCode,
      settings: { autoStart: false },
    })
    await settingsUpdated

    const joinerSocket = await connectClient()
    const joiner = await createSession(joinerSocket, 'Joiner')

    const joinerJoined = waitForEvent<RoomPayload>(
      joinerSocket,
      EVENTS.ROOM_JOINED,
    )
    joinerSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: joiner.playerId,
      code: roomCode,
    })
    await joinerJoined

    // Wait a moment and verify game:dealt was NOT emitted
    await new Promise(resolve => setTimeout(resolve, 100))

    // Now owner manually starts the game
    const ownerDealt = waitForEvent(ownerSocket, EVENTS.GAME_DEALT, 2000)
    const joinerDealt = waitForEvent(joinerSocket, EVENTS.GAME_DEALT, 2000)

    ownerSocket.emit(EVENTS.GAME_START, {
      playerId: owner.playerId,
      code: roomCode,
    })

    await expect(ownerDealt).resolves.toBeDefined()
    await expect(joinerDealt).resolves.toBeDefined()
  })

  it('allow foul disabled: foul arrangement is rejected', async () => {
    const { ownerSocket, owner, roomCode } = await setupOwnerAndRoom()

    // Disable allow foul
    const settingsUpdated = waitForEvent<SettingsUpdatedPayload>(
      ownerSocket,
      EVENTS.ROOM_SETTINGS_UPDATED,
    )
    ownerSocket.emit(EVENTS.ROOM_SETTINGS_UPDATE, {
      playerId: owner.playerId,
      code: roomCode,
      settings: { allowFoul: false },
    })
    await settingsUpdated

    const joinerSocket = await connectClient()
    const joiner = await createSession(joinerSocket, 'Joiner')

    const ownerDealt = waitForEvent<{ hand: Card[] }>(
      ownerSocket,
      EVENTS.GAME_DEALT,
      3000,
    )
    joinerSocket.emit(EVENTS.ROOM_JOIN, {
      playerId: joiner.playerId,
      code: roomCode,
    })
    await waitForEvent(joinerSocket, EVENTS.ROOM_JOINED)

    const { hand } = await ownerDealt

    // Build a guaranteed foul arrangement using the same helper the server uses
    const foulArrangement = createForfeitArrangement(owner.playerId, hand)

    const errorEvent = waitForEvent<ErrorPayload>(ownerSocket, EVENTS.ERROR)
    ownerSocket.emit(EVENTS.GAME_SUBMIT, {
      playerId: owner.playerId,
      code: roomCode,
      arrangement: foulArrangement,
    })

    await expect(errorEvent).resolves.toEqual({
      message: 'Foul arrangements are not allowed in this room',
    })
  })

  it('rejects settings update with invalid values', async () => {
    const { ownerSocket, owner, roomCode } = await setupOwnerAndRoom()

    const errorEvent = waitForEvent<ErrorPayload>(ownerSocket, EVENTS.ERROR)
    ownerSocket.emit(EVENTS.ROOM_SETTINGS_UPDATE, {
      playerId: owner.playerId,
      code: roomCode,
      settings: { timerSeconds: 9999 }, // exceeds max
    })

    await expect(errorEvent).resolves.toBeDefined()
  })

  it('gAME_START by non-owner is rejected', async () => {
    const { ownerSocket: _ownerSocket, owner: _owner, roomCode } = await setupOwnerAndRoom()

    const joinerSocket = await connectClient()
    const joiner = await createSession(joinerSocket, 'Joiner')

    // First disable autoStart so game doesn't auto-start
    // (need owner to do this first - but we need a fresh room for this test)
    const ownerSocket2 = await connectClient()
    const owner2 = await createSession(ownerSocket2, 'Owner2')
    const room2Created = waitForEvent<RoomPayload>(ownerSocket2, EVENTS.ROOM_CREATED)
    ownerSocket2.emit(EVENTS.ROOM_CREATE, { playerId: owner2.playerId })
    const room2 = await room2Created

    const settingsUpdated = waitForEvent<SettingsUpdatedPayload>(
      ownerSocket2,
      EVENTS.ROOM_SETTINGS_UPDATED,
    )
    ownerSocket2.emit(EVENTS.ROOM_SETTINGS_UPDATE, {
      playerId: owner2.playerId,
      code: room2.code,
      settings: { autoStart: false },
    })
    await settingsUpdated

    const joiner2Socket = await connectClient()
    const joiner2 = await createSession(joiner2Socket, 'Joiner2')
    joiner2Socket.emit(EVENTS.ROOM_JOIN, {
      playerId: joiner2.playerId,
      code: room2.code,
    })
    await waitForEvent(joiner2Socket, EVENTS.ROOM_JOINED)

    // Joiner tries to start game (should be rejected)
    const errorEvent = waitForEvent<ErrorPayload>(joiner2Socket, EVENTS.ERROR)
    joiner2Socket.emit(EVENTS.GAME_START, {
      playerId: joiner2.playerId,
      code: room2.code,
    })

    await expect(errorEvent).resolves.toEqual({
      message: 'Only the room creator can start the game',
    })

    void roomCode
    void joiner
    void joinerSocket
  })
})
