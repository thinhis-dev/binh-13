import type { Card, RoundResult } from '@binh-13/shared'
import { EVENTS } from '@binh-13/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ensureSocketConnected, socket } from '@/lib/socket'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'

export function useSocket() {
  const [connected, setConnected] = useState(socket.connected)
  const hasAttemptedRestoreRef = useRef(false)
  const playerId = useSessionStore(s => s.playerId)
  const setSession = useSessionStore(s => s.setSession)
  const clearSession = useSessionStore(s => s.clearSession)
  const setHand = useGameStore(s => s.setHand)
  const setTimer = useGameStore(s => s.setTimer)
  const setTimerExpired = useGameStore(s => s.setTimerExpired)
  const setOpponentSubmitted = useGameStore(s => s.setOpponentSubmitted)
  const setResult = useGameStore(s => s.setResult)
  const setRematchOpponentRequested = useGameStore(s => s.setRematchOpponentRequested)
  const setRematchRequested = useGameStore(s => s.setRematchRequested)
  const setRematchCancelledReason = useGameStore(s => s.setRematchCancelledReason)
  const reset = useGameStore(s => s.reset)

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

  const startGame = useCallback((playerId: number, code: string) => {
    ensureSocketConnected()
    socket.emit(EVENTS.GAME_START, { playerId, code })
  }, [])

  const surrender = useCallback((playerId: number, code: string) => {
    ensureSocketConnected()
    socket.emit(EVENTS.GAME_SURRENDER, { playerId, code })
  }, [])

  const requestRematch = useCallback((playerId: number, code: string) => {
    ensureSocketConnected()
    socket.emit(EVENTS.GAME_REMATCH_REQUEST, { playerId, code })
  }, [])

  const declineRematch = useCallback((playerId: number, code: string) => {
    ensureSocketConnected()
    socket.emit(EVENTS.GAME_REMATCH_DECLINED, { playerId, code })
  }, [])

  const destroySession = useCallback((playerId: number) => {
    ensureSocketConnected()
    socket.emit(EVENTS.SESSION_DESTROY, { playerId })
  }, [])

  const getProfile = useCallback((playerId: number) => {
    ensureSocketConnected()
    socket.emit(EVENTS.PROFILE_GET, { playerId })
  }, [])

  const updateProfile = useCallback(
    (playerId: number, updates: { name?: string, avatar?: string }) => {
      ensureSocketConnected()
      socket.emit(EVENTS.PROFILE_UPDATE, { playerId, ...updates })
    },
    [],
  )

  const register = useCallback((playerId: number, username: string, password: string) => {
    ensureSocketConnected()
    socket.emit(EVENTS.AUTH_REGISTER, { playerId, username, password })
  }, [])

  const login = useCallback((username: string, password: string) => {
    ensureSocketConnected()
    socket.emit(EVENTS.AUTH_LOGIN, { username, password })
  }, [])

  useEffect(() => {
    const handleConnect = () => setConnected(true)
    const handleDisconnect = () => setConnected(false)
    const handleDealt = (payload: { hand: Card[], timerSeconds: number }) => {
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
    const handleRematchRequested = (payload: { requestedBy: number }) => {
      // Broadcast goes to the whole room, including the requester's own socket — ignore the
      // echo of our own request, or our own Rematch/Waiting-for-opponent control disappears.
      if (payload.requestedBy === playerId)
        return
      setRematchOpponentRequested(true)
    }
    const handleRematchAccepted = () => {
      reset()
    }
    const handleRematchCancelled = (payload: {
      declinedBy: number
      reason: 'declined' | 'disconnected' | 'left'
    }) => {
      setRematchRequested(false)
      setRematchOpponentRequested(false)
      setRematchCancelledReason(payload.reason)
    }
    const handleSessionCreated = (payload: { playerId: number, name: string, token: string }) => {
      setSession(payload.playerId, payload.name, payload.token)
    }
    const handleSessionRestored = (payload: { playerId: number, name: string, avatar: string }) => {
      setSession(payload.playerId, payload.name)
    }
    const handleSessionRestoreFailed = () => {
      clearSession()
    }

    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    socket.on(EVENTS.GAME_DEALT, handleDealt)
    socket.on(EVENTS.GAME_TIMER, handleTimer)
    socket.on(EVENTS.GAME_OPPONENT_SUBMITTED, handleOpponentSubmitted)
    socket.on(EVENTS.GAME_RESULT, handleResult)
    socket.on(EVENTS.GAME_REMATCH_REQUESTED, handleRematchRequested)
    socket.on(EVENTS.GAME_REMATCH_ACCEPTED, handleRematchAccepted)
    socket.on(EVENTS.GAME_REMATCH_CANCELLED, handleRematchCancelled)
    socket.on(EVENTS.SESSION_CREATED, handleSessionCreated)
    socket.on(EVENTS.SESSION_RESTORED, handleSessionRestored)
    socket.on(EVENTS.SESSION_RESTORE_FAILED, handleSessionRestoreFailed)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      socket.off(EVENTS.GAME_DEALT, handleDealt)
      socket.off(EVENTS.GAME_TIMER, handleTimer)
      socket.off(EVENTS.GAME_OPPONENT_SUBMITTED, handleOpponentSubmitted)
      socket.off(EVENTS.GAME_RESULT, handleResult)
      socket.off(EVENTS.GAME_REMATCH_REQUESTED, handleRematchRequested)
      socket.off(EVENTS.GAME_REMATCH_ACCEPTED, handleRematchAccepted)
      socket.off(EVENTS.GAME_REMATCH_CANCELLED, handleRematchCancelled)
      socket.off(EVENTS.SESSION_CREATED, handleSessionCreated)
      socket.off(EVENTS.SESSION_RESTORED, handleSessionRestored)
      socket.off(EVENTS.SESSION_RESTORE_FAILED, handleSessionRestoreFailed)
    }
  }, [setHand, setTimer, setTimerExpired, setOpponentSubmitted, setResult, setRematchOpponentRequested, reset, setRematchRequested, setRematchCancelledReason, setSession, clearSession, playerId])

  useEffect(() => {
    if (hasAttemptedRestoreRef.current)
      return

    const { token } = useSessionStore.getState()
    if (!token)
      return

    hasAttemptedRestoreRef.current = true
    ensureSocketConnected()
    socket.emit(EVENTS.SESSION_RESTORE, { token })
  }, [])

  return {
    connected,
    createSession,
    createRoom,
    joinRoom,
    leaveRoom,
    clearRoom,
    sendMessage,
    submitArrangement,
    startGame,
    surrender,
    requestRematch,
    declineRematch,
    destroySession,
    getProfile,
    updateProfile,
    register,
    login,
  }
}
