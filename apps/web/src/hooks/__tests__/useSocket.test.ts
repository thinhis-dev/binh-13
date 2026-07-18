import { EVENTS } from '@binh-13/shared'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureSocketConnected, socket } from '@/lib/socket'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'
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

  it('getProfile() and updateProfile() emit their payloads', () => {
    const { result } = renderHook(() => useSocket())

    act(() => {
      result.current.getProfile(1)
      result.current.updateProfile(1, { name: 'New Name', avatar: 'fox' })
    })

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.PROFILE_GET, { playerId: 1 })
    expect(socket.emit).toHaveBeenCalledWith(EVENTS.PROFILE_UPDATE, {
      playerId: 1,
      name: 'New Name',
      avatar: 'fox',
    })
  })

  it('register() and login() emit their payloads', () => {
    const { result } = renderHook(() => useSocket())

    act(() => {
      result.current.register(1, 'alice_dev', 'password123')
      result.current.login('alice_dev', 'password123')
    })

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.AUTH_REGISTER, {
      playerId: 1,
      username: 'alice_dev',
      password: 'password123',
    })
    expect(socket.emit).toHaveBeenCalledWith(EVENTS.AUTH_LOGIN, {
      username: 'alice_dev',
      password: 'password123',
    })
  })

  it('startGame(), submitArrangement(), and destroySession() emit their payloads', () => {
    const { result } = renderHook(() => useSocket())

    act(() => {
      result.current.startGame(1, 'ABC123')
      result.current.submitArrangement(1, 'ABC123', { group1: [], group2: [], group3: [] })
      result.current.destroySession(1)
    })

    expect(socket.emit).toHaveBeenCalledWith(EVENTS.GAME_START, { playerId: 1, code: 'ABC123' })
    expect(socket.emit).toHaveBeenCalledWith(EVENTS.GAME_SUBMIT, {
      playerId: 1,
      code: 'ABC123',
      arrangement: { group1: [], group2: [], group3: [] },
    })
    expect(socket.emit).toHaveBeenCalledWith(EVENTS.SESSION_DESTROY, { playerId: 1 })
  })

  it('handles GAME_DEALT, GAME_TIMER, GAME_OPPONENT_SUBMITTED, and GAME_RESULT events', () => {
    renderHook(() => useSocket())
    const socketOn = vi.mocked(socket.on)
    const dealtHandler = socketOn.mock.calls.find(([event]) => event === EVENTS.GAME_DEALT)?.[1]
    const timerHandler = socketOn.mock.calls.find(([event]) => event === EVENTS.GAME_TIMER)?.[1]
    const opponentSubmittedHandler = socketOn.mock.calls.find(([event]) => event === EVENTS.GAME_OPPONENT_SUBMITTED)?.[1]
    const resultHandler = socketOn.mock.calls.find(([event]) => event === EVENTS.GAME_RESULT)?.[1]

    act(() => {
      dealtHandler?.({ hand: [], timerSeconds: 60 })
      timerHandler?.({ secondsLeft: 30 })
      opponentSubmittedHandler?.()
    })

    expect(useGameStore.getState().timerSeconds).toBe(30)
    expect(useGameStore.getState().opponentSubmitted).toBe(true)

    act(() => {
      timerHandler?.({ secondsLeft: 0 })
    })
    expect(useGameStore.getState().timerExpired).toBe(true)

    const resultPayload = {
      group1: { result: 'p1', p1Hand: 'a', p2Hand: 'b', p1Foul: false, p2Foul: false },
      group2: { result: 'p1', p1Hand: 'a', p2Hand: 'b', p1Foul: false, p2Foul: false },
      group3: { result: 'p1', p1Hand: 'a', p2Hand: 'b', p1Foul: false, p2Foul: false },
      winner: 'p1' as const,
      p1Score: 3,
      p2Score: 0,
      p1Foul: false,
      p2Foul: false,
      arrangements: { p1: {} as never, p2: {} as never },
    }
    act(() => {
      resultHandler?.(resultPayload)
    })
    expect(useGameStore.getState().result).toEqual(resultPayload)
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

describe('useSocket - session restore-on-boot', () => {
  beforeEach(() => {
    localStorage.clear()
    useSessionStore.getState().clearSession()
  })

  afterEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useSessionStore.getState().clearSession()
  })

  it('emits SESSION_RESTORE on mount when a token is already stored', () => {
    useSessionStore.setState({ token: 'stored-token' })

    renderHook(() => useSocket())

    expect(ensureSocketConnected).toHaveBeenCalled()
    expect(socket.emit).toHaveBeenCalledWith(EVENTS.SESSION_RESTORE, { token: 'stored-token' })
  })

  it('does not emit SESSION_RESTORE on mount when there is no stored token', () => {
    renderHook(() => useSocket())

    expect(socket.emit).not.toHaveBeenCalledWith(EVENTS.SESSION_RESTORE, expect.anything())
  })

  it('SESSION_CREATED saves the token into the session store', () => {
    renderHook(() => useSocket())
    const socketOn = vi.mocked(socket.on)
    const handler = socketOn.mock.calls.find(([event]) => event === EVENTS.SESSION_CREATED)?.[1]

    act(() => {
      handler?.({ playerId: 5, name: 'Alice', token: 'new-token' })
    })

    expect(useSessionStore.getState()).toMatchObject({
      playerId: 5,
      name: 'Alice',
      token: 'new-token',
    })
  })

  it('SESSION_RESTORED hydrates the store with the restored identity', () => {
    renderHook(() => useSocket())
    const socketOn = vi.mocked(socket.on)
    const handler = socketOn.mock.calls.find(([event]) => event === EVENTS.SESSION_RESTORED)?.[1]

    act(() => {
      handler?.({ playerId: 9, name: 'Bob', avatar: 'fox' })
    })

    expect(useSessionStore.getState()).toMatchObject({
      playerId: 9,
      name: 'Bob',
    })
  })

  it('SESSION_RESTORE_FAILED clears the stored session', () => {
    useSessionStore.getState().setSession(9, 'Bob', 'stale-token')

    renderHook(() => useSocket())
    const socketOn = vi.mocked(socket.on)
    const handler = socketOn.mock.calls.find(([event]) => event === EVENTS.SESSION_RESTORE_FAILED)?.[1]

    act(() => {
      handler?.()
    })

    expect(useSessionStore.getState()).toMatchObject({
      playerId: null,
      name: null,
      token: null,
    })
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
