import { useCallback, useEffect, useState } from 'react'
import { EVENTS } from '@binh-13/shared'
import type { Card, RoundResult } from '@binh-13/shared'
import { ensureSocketConnected, socket } from '@/lib/socket'
import { useGameStore } from '@/stores/gameStore'

export function useSocket() {
  const [connected, setConnected] = useState(socket.connected)
  const setHand = useGameStore((s) => s.setHand)
  const setTimer = useGameStore((s) => s.setTimer)
  const setTimerExpired = useGameStore((s) => s.setTimerExpired)
  const setOpponentSubmitted = useGameStore((s) => s.setOpponentSubmitted)
  const setResult = useGameStore((s) => s.setResult)

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

  const sendMessage = useCallback(
    (playerId: number, code: string, text: string) => {
      ensureSocketConnected()
      socket.emit(EVENTS.ROOM_MESSAGE, { playerId, code, text })
    },
    [],
  )

  const submitArrangement = useCallback(
    (
      playerId: number,
      code: string,
      arrangement: {
        group1: Card[]
        group2: Card[]
        group3: Card[]
      },
    ) => {
      ensureSocketConnected()
      socket.emit(EVENTS.GAME_SUBMIT, { playerId, code, arrangement })
    },
    [],
  )

  useEffect(() => {
    const handleConnect = () => setConnected(true)
    const handleDisconnect = () => setConnected(false)
    const handleDealt = (payload: { hand: Card[]; timerSeconds: number }) => {
      setHand(payload.hand)
      setTimer(payload.timerSeconds)
    }
    const handleTimer = (payload: { secondsLeft: number }) => {
      setTimer(payload.secondsLeft)
      if (payload.secondsLeft <= 0) {
        setTimerExpired(true)
      }
    }
    const handleOpponentSubmitted = () => {
      setOpponentSubmitted(true)
    }
    const handleResult = (result: RoundResult) => {
      setResult(result)
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on(EVENTS.GAME_DEALT, handleDealt)
    socket.on(EVENTS.GAME_TIMER, handleTimer)
    socket.on(EVENTS.GAME_OPPONENT_SUBMITTED, handleOpponentSubmitted)
    socket.on(EVENTS.GAME_RESULT, handleResult)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off(EVENTS.GAME_DEALT, handleDealt)
      socket.off(EVENTS.GAME_TIMER, handleTimer)
      socket.off(EVENTS.GAME_OPPONENT_SUBMITTED, handleOpponentSubmitted)
      socket.off(EVENTS.GAME_RESULT, handleResult)
    }
  }, [setHand, setTimer, setTimerExpired, setOpponentSubmitted, setResult])

  return {
    connected,
    createSession,
    createRoom,
    joinRoom,
    leaveRoom,
    clearRoom,
    sendMessage,
    submitArrangement,
  }
}
