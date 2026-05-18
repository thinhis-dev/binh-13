import type { Room } from '@binh-13/shared'
import type { FormEvent } from 'react'
import { EVENTS } from '@binh-13/shared'
import axios from 'axios'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useSocket } from '@/hooks/useSocket'
import { socket } from '@/lib/socket'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'

interface HealthResponse {
  status: string
  timestamp: string
}

type PendingAction = 'session' | 'create' | 'join' | null

export default function Home() {
  const navigate = useNavigate()
  const { createSession, createRoom, joinRoom } = useSocket()
  const playerId = useSessionStore(state => state.playerId)
  const storedName = useSessionStore(state => state.name)
  const setSession = useSessionStore(state => state.setSession)
  const setRoomCode = useSessionStore(state => state.setRoom)
  const setGameRoom = useGameStore(state => state.setRoom)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [serverError, setServerError] = useState(false)
  const [name, setName] = useState(storedName ?? '')
  const [roomCode, setRoomCodeInput] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    axios
      .get<HealthResponse>('/api/health')
      .then(res => setHealth(res.data))
      .catch(() => setServerError(true))
  }, [])

  useEffect(() => {
    const handleSessionCreated = (payload: { playerId: number, name: string }) => {
      setSession(payload.playerId, payload.name)
      setPendingAction(null)
      setError('')
    }

    const handleRoomCreated = (payload: { code: string }) => {
      setRoomCode(payload.code)
      setRoomCodeInput(payload.code)
      setPendingAction(null)
      navigate(`/room/${payload.code}`)
    }

    const handleRoomJoined = (payload: { code: string }) => {
      setRoomCode(payload.code)
      setPendingAction(null)
      navigate(`/room/${payload.code}`)
    }

    const handleRoomState = (payload: { room: Room }) => {
      setGameRoom(payload.room)
    }

    const handleError = (payload: { message: string }) => {
      setError(payload.message)
      setPendingAction(null)
    }

    const handleConnectError = () => {
      setError('Could not connect to the game server')
      setPendingAction(null)
    }

    socket.on(EVENTS.SESSION_CREATED, handleSessionCreated)
    socket.on(EVENTS.ROOM_CREATED, handleRoomCreated)
    socket.on(EVENTS.ROOM_JOINED, handleRoomJoined)
    socket.on(EVENTS.ROOM_STATE, handleRoomState)
    socket.on(EVENTS.ERROR, handleError)
    socket.on('connect_error', handleConnectError)

    return () => {
      socket.off(EVENTS.SESSION_CREATED, handleSessionCreated)
      socket.off(EVENTS.ROOM_CREATED, handleRoomCreated)
      socket.off(EVENTS.ROOM_JOINED, handleRoomJoined)
      socket.off(EVENTS.ROOM_STATE, handleRoomState)
      socket.off(EVENTS.ERROR, handleError)
      socket.off('connect_error', handleConnectError)
    }
  }, [navigate, setGameRoom, setRoomCode, setSession])

  function handleStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName)
      return

    setError('')
    setPendingAction('session')
    createSession(trimmedName)
  }

  function handleCreateRoom() {
    if (!playerId)
      return

    setError('')
    setPendingAction('create')
    createRoom(playerId)
  }

  function handleJoinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!playerId || roomCode.length !== 6)
      return

    setError('')
    setPendingAction('join')
    joinRoom(playerId, roomCode)
  }

  const hasSession = playerId !== null && storedName !== null

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold tracking-tight">Binh 13</h1>
        <p className="text-muted-foreground">
          Chinese Poker - 2 players - Real-time
        </p>
      </div>

      <div className="text-sm text-muted-foreground">
        {serverError && (
          <span className="text-destructive">Server offline</span>
        )}
        {!serverError && !health && <span>Connecting to server...</span>}
        {health && (
          <span className="text-green-600">
            Server ok -
            {' '}
            {new Date(health.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && (
        <div className="w-full max-w-sm rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {!hasSession
        ? (
            <form className="w-full max-w-sm space-y-3" onSubmit={handleStart}>
              <label className="block text-sm font-medium" htmlFor="player-name">
                Name
              </label>
              <input
                id="player-name"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                maxLength={20}
                required
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="Alice"
              />
              <Button
                className="w-full"
                type="submit"
                disabled={!name.trim() || pendingAction === 'session'}
              >
                {pendingAction === 'session' ? 'Starting...' : 'Start'}
              </Button>
            </form>
          )
        : (
            <div className="w-full max-w-sm space-y-4">
              <div className="text-center text-sm text-muted-foreground">
                Welcome back,
                {' '}
                <span className="font-medium text-foreground">{storedName}</span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button
                  type="button"
                  onClick={handleCreateRoom}
                  disabled={pendingAction === 'create'}
                >
                  {pendingAction === 'create' ? 'Creating...' : 'Create Room'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowJoin(value => !value)}
                >
                  Join Room
                </Button>
              </div>

              {showJoin && (
                <form className="space-y-3" onSubmit={handleJoinRoom}>
                  <label className="block text-sm font-medium" htmlFor="room-code">
                    Room code
                  </label>
                  <input
                    id="room-code"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm uppercase tracking-widest outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    maxLength={6}
                    required
                    value={roomCode}
                    onChange={event =>
                      setRoomCodeInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                    placeholder="A3F9KZ"
                  />
                  <Button
                    className="w-full"
                    type="submit"
                    disabled={roomCode.length !== 6 || pendingAction === 'join'}
                  >
                    {pendingAction === 'join' ? 'Joining...' : 'Join'}
                  </Button>
                </form>
              )}
            </div>
          )}
    </div>
  )
}
