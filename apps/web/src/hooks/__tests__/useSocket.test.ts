import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EVENTS } from '@binh-13/shared'
import { ensureSocketConnected, socket } from '@/lib/socket'
import { useSocket } from '../useSocket'

describe('useSocket', () => {
  afterEach(() => {
    vi.clearAllMocks()
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
})
