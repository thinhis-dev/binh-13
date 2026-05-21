import { EVENTS } from '@binh-13/shared'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureSocketConnected, socket } from '@/lib/socket'
import { useGameStore } from '@/stores/gameStore'
import { useSocket } from '../useSocket'

describe('useSocket', () => {
  afterEach(() => {
    vi.clearAllMocks()
    useGameStore.getState().reset()
  })

  it('emits the current room/session actions', () => {
    const { result } = renderHook(() => useSocket())

    act(() => {
      result.current.createSession('Alice')
      result.current.createRoom(1)
      result.current.joinRoom(1, 'ABC123')
      result.current.leaveRoom(1, 'ABC123')
      result.current.clearRoom(1, 'ABC123')
      result.current.sendMessage(1, 'ABC123', 'Ready')
    })

    expect(ensureSocketConnected).toHaveBeenCalledTimes(6)
    expect(socket.emit).toHaveBeenNthCalledWith(1, EVENTS.SESSION_CREATE, {
      name: 'Alice',
    })
    expect(socket.emit).toHaveBeenNthCalledWith(6, EVENTS.ROOM_MESSAGE, {
      playerId: 1,
      code: 'ABC123',
      text: 'Ready',
    })
  })

  it('tracks socket connection state from socket events', () => {
    const { result, unmount } = renderHook(() => useSocket())
    const socketOn = vi.mocked(socket.on)
    const connectHandler = socketOn.mock.calls.find(([event]) => event === 'connect')?.[1]
    const disconnectHandler = socketOn.mock.calls.find(
      ([event]) => event === 'disconnect',
    )?.[1]

    expect(result.current.connected).toBe(false)

    act(() => {
      connectHandler?.()
    })
    expect(result.current.connected).toBe(true)

    act(() => {
      disconnectHandler?.()
    })
    expect(result.current.connected).toBe(false)

    unmount()
    expect(socket.off).toHaveBeenCalledWith('connect', expect.any(Function))
    expect(socket.off).toHaveBeenCalledWith('disconnect', expect.any(Function))
  })

  it('surrender() emits EVENTS.GAME_SURRENDER with correct payload', () => {
    const { result } = renderHook(() => useSocket())

    act(() => {
      result.current.surrender(42, 'ABCDEF')
    })

    expect(ensureSocketConnected).toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith(EVENTS.GAME_SURRENDER, {
      playerId: 42,
      code: 'ABCDEF',
    })
  })

  it('requestRematch() emits GAME_REMATCH_REQUEST with correct payload', () => {
    const { result } = renderHook(() => useSocket())

    act(() => {
      result.current.requestRematch(1, 'ROOM01')
    })

    expect(ensureSocketConnected).toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith(EVENTS.GAME_REMATCH_REQUEST, {
      playerId: 1,
      code: 'ROOM01',
    })
  })

  it('declineRematch() emits GAME_REMATCH_DECLINED with correct payload', () => {
    const { result } = renderHook(() => useSocket())

    act(() => {
      result.current.declineRematch(2, 'ROOM01')
    })

    expect(ensureSocketConnected).toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith(EVENTS.GAME_REMATCH_DECLINED, {
      playerId: 2,
      code: 'ROOM01',
    })
  })

  it('receiving GAME_REMATCH_REQUESTED sets rematchOpponentRequested to true', () => {
    renderHook(() => useSocket())
    const socketOn = vi.mocked(socket.on)
    const handler = socketOn.mock.calls.find(
      ([event]) => event === EVENTS.GAME_REMATCH_REQUESTED,
    )?.[1]

    expect(useGameStore.getState().rematchOpponentRequested).toBe(false)

    act(() => {
      handler?.({ requestedBy: 1 })
    })

    expect(useGameStore.getState().rematchOpponentRequested).toBe(true)
  })

  it('receiving GAME_REMATCH_ACCEPTED resets game state', () => {
    useGameStore.getState().setRematchRequested(true)
    useGameStore.getState().setRematchOpponentRequested(true)

    renderHook(() => useSocket())
    const socketOn = vi.mocked(socket.on)
    const handler = socketOn.mock.calls.find(
      ([event]) => event === EVENTS.GAME_REMATCH_ACCEPTED,
    )?.[1]

    act(() => {
      handler?.({})
    })

    expect(useGameStore.getState().rematchRequested).toBe(false)
    expect(useGameStore.getState().rematchOpponentRequested).toBe(false)
  })

  it('receiving GAME_REMATCH_CANCELLED resets rematch flags and sets reason', () => {
    useGameStore.getState().setRematchRequested(true)
    useGameStore.getState().setRematchOpponentRequested(true)

    renderHook(() => useSocket())
    const socketOn = vi.mocked(socket.on)
    const handler = socketOn.mock.calls.find(
      ([event]) => event === EVENTS.GAME_REMATCH_CANCELLED,
    )?.[1]

    act(() => {
      handler?.({ declinedBy: 2, reason: 'declined' })
    })

    expect(useGameStore.getState().rematchRequested).toBe(false)
    expect(useGameStore.getState().rematchOpponentRequested).toBe(false)
    expect(useGameStore.getState().rematchCancelledReason).toBe('declined')
  })

  it('gAME_REMATCH_CANCELLED with reason left sets correct reason', () => {
    renderHook(() => useSocket())
    const socketOn = vi.mocked(socket.on)
    const handler = socketOn.mock.calls.find(
      ([event]) => event === EVENTS.GAME_REMATCH_CANCELLED,
    )?.[1]

    act(() => {
      handler?.({ declinedBy: 1, reason: 'left' })
    })

    expect(useGameStore.getState().rematchCancelledReason).toBe('left')
  })

  it('registers and unregisters all rematch event listeners', () => {
    const { unmount } = renderHook(() => useSocket())

    expect(socket.on).toHaveBeenCalledWith(EVENTS.GAME_REMATCH_REQUESTED, expect.any(Function))
    expect(socket.on).toHaveBeenCalledWith(EVENTS.GAME_REMATCH_ACCEPTED, expect.any(Function))
    expect(socket.on).toHaveBeenCalledWith(EVENTS.GAME_REMATCH_CANCELLED, expect.any(Function))

    unmount()

    expect(socket.off).toHaveBeenCalledWith(EVENTS.GAME_REMATCH_REQUESTED, expect.any(Function))
    expect(socket.off).toHaveBeenCalledWith(EVENTS.GAME_REMATCH_ACCEPTED, expect.any(Function))
    expect(socket.off).toHaveBeenCalledWith(EVENTS.GAME_REMATCH_CANCELLED, expect.any(Function))
  })
})

describe('useSocket - beforeEach reset', () => {
  beforeEach(() => {
    useGameStore.getState().reset()
  })

  afterEach(() => {
    vi.clearAllMocks()
    useGameStore.getState().reset()
  })

  it('gAME_REMATCH_ACCEPTED calls reset() clearing all game state', () => {
    // Set some game state
    useGameStore.getState().setRematchRequested(true)
    useGameStore.getState().setRematchOpponentRequested(true)
    useGameStore.getState().setSubmitted(true)
    useGameStore.getState().setOpponentSubmitted(true)

    renderHook(() => useSocket())
    const socketOn = vi.mocked(socket.on)
    const handler = socketOn.mock.calls.find(
      ([event]) => event === EVENTS.GAME_REMATCH_ACCEPTED,
    )?.[1]

    act(() => {
      handler?.({})
    })

    const state = useGameStore.getState()
    expect(state.rematchRequested).toBe(false)
    expect(state.rematchOpponentRequested).toBe(false)
    expect(state.submitted).toBe(false)
    expect(state.opponentSubmitted).toBe(false)
    expect(state.result).toBeNull()
  })
})
