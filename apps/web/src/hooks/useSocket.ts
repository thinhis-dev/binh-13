import { useCallback, useEffect, useState } from 'react'
import { EVENTS } from '@binh-13/shared'
import { ensureSocketConnected, socket } from '@/lib/socket'

export function useSocket() {
  const [connected, setConnected] = useState(socket.connected)
  const createSession = useCallback((name: string) => {
    ensureSocketConnected()
    socket.emit(EVENTS.SESSION_CREATE, { name })
  }, [])

  const createRoom = useCallback((playerId: number) => {
    ensureSocketConnected()
    socket.emit(EVENTS.ROOM_CREATE, { playerId })
  }, [])

  const joinRoom = useCallback((playerId: number, code: string) => {
    ensureSocketConnected()
    socket.emit(EVENTS.ROOM_JOIN, { playerId, code })
  }, [])

  const leaveRoom = useCallback((playerId: number, code: string) => {
    ensureSocketConnected()
    socket.emit(EVENTS.ROOM_LEAVE, { playerId, code })
  }, [])

  const clearRoom = useCallback((playerId: number, code: string) => {
    ensureSocketConnected()
    socket.emit(EVENTS.ROOM_CLEAR, { playerId, code })
  }, [])

  const sendMessage = useCallback((playerId: number, code: string, text: string) => {
    ensureSocketConnected()
    socket.emit(EVENTS.ROOM_MESSAGE, { playerId, code, text })
  }, [])

  useEffect(() => {
    const handleConnect = () => setConnected(true)
    const handleDisconnect = () => setConnected(false)

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
    }
  }, [])

  return {
    connected,
    createSession,
    createRoom,
    joinRoom,
    leaveRoom,
    clearRoom,
    sendMessage,
  }
}
