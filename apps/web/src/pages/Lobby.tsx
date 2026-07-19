import type { Card, Room, RoomSettings } from '@binh-13/shared'
import { EVENTS } from '@binh-13/shared'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RoomSettingsModal } from '@/components/game/RoomSettingsModal'
import { Button } from '@/components/ui/button'
import { useSocket } from '@/hooks/useSocket'
import { socket } from '@/lib/socket'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'

export default function Lobby() {
  const navigate = useNavigate()
  const params = useParams()
  const code = params.code?.toUpperCase() ?? ''
  const { joinRoom, leaveRoom, clearRoom, startGame } = useSocket()
  const playerId = useSessionStore(state => state.playerId)
  const setRoomCode = useSessionStore(state => state.setRoom)
  const room = useGameStore(state => state.room)
  const settings = useGameStore(state => state.settings)
  const setGameRoom = useGameStore(state => state.setRoom)
  const setSettings = useGameStore(state => state.setSettings)
  const setHand = useGameStore(state => state.setHand)
  const setTimer = useGameStore(state => state.setTimer)
  const resetGame = useGameStore(state => state.reset)
  const [error, setError] = useState('')

  // Deliberately keyed on `code`/`playerId` only — not `roomCode`. `roomCode` is written
  // by this same effect, and handleLeave() clears it (setRoomCode(null)) before navigating
  // away; if `roomCode` were a dependency, that clear would re-run this effect while Lobby
  // is still mounted (URL still /room/:code) and immediately re-join the room we just left.
  useEffect(() => {
    if (!playerId || !code) {
      navigate('/')
      return
    }

    setRoomCode(code)
    joinRoom(playerId, code)
  }, [code, joinRoom, navigate, playerId, setRoomCode])

  useEffect(() => {
    const handleRoomState = (payload: { room: Room }) => {
      setGameRoom(payload.room)
      setError('')
    }

    const handleSettingsUpdated = (payload: { settings: RoomSettings }) => {
      setSettings(payload.settings)
    }

    const handleGameDealt = (payload: {
      hand: Card[]
      timerSeconds: number
    }) => {
      setHand(payload.hand)
      setTimer(payload.timerSeconds)
      navigate(`/room/${code}/game`)
    }

    const handleRoomCleared = () => {
      setRoomCode(null)
      resetGame()
      navigate('/')
    }

    const handleRoomLeft = (payload: { playerId: number }) => {
      if (payload.playerId !== playerId)
        return

      setRoomCode(null)
      resetGame()
      navigate('/')
    }

    const handleError = (payload: { message: string }) => {
      setError(payload.message)
    }

    socket.on(EVENTS.ROOM_STATE, handleRoomState)
    socket.on(EVENTS.ROOM_SETTINGS_UPDATED, handleSettingsUpdated)
    socket.on(EVENTS.GAME_DEALT, handleGameDealt)
    socket.on(EVENTS.ROOM_LEFT, handleRoomLeft)
    socket.on(EVENTS.ROOM_CLEARED, handleRoomCleared)
    socket.on(EVENTS.ERROR, handleError)

    return () => {
      socket.off(EVENTS.ROOM_STATE, handleRoomState)
      socket.off(EVENTS.ROOM_SETTINGS_UPDATED, handleSettingsUpdated)
      socket.off(EVENTS.GAME_DEALT, handleGameDealt)
      socket.off(EVENTS.ROOM_LEFT, handleRoomLeft)
      socket.off(EVENTS.ROOM_CLEARED, handleRoomCleared)
      socket.off(EVENTS.ERROR, handleError)
    }
  }, [
    navigate,
    playerId,
    resetGame,
    setGameRoom,
    setSettings,
    setHand,
    setTimer,
    setRoomCode,
    code,
  ])

  const seats = useMemo(
    () =>
      [1, 2].map(seat =>
        room?.players.find(player => player.seat === seat),
      ),
    [room],
  )

  function handleLeave() {
    if (!playerId || !code)
      return

    leaveRoom(playerId, code)
    setRoomCode(null)
    resetGame()
    navigate('/')
  }

  function handleClear() {
    if (!playerId || !code)
      return
    clearRoom(playerId, code)
  }

  function copyCode() {
    void navigator.clipboard?.writeText(code)
  }

  const isCreator = room?.createdBy === playerId
  const bothPlayersReady = (room?.players.length ?? 0) >= 2

  function handleStartGame() {
    if (!playerId || !code)
      return
    startGame(playerId, code)
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">
              Room
              <span data-testid="room-code">{code}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Share this code with the second player.
            </p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={copyCode}>
              Copy Code
            </Button>
            <Button type="button" variant="outline" onClick={handleLeave}>
              Leave
            </Button>
            {isCreator && settings && (
              <RoomSettingsModal
                settings={settings}
                code={code}
                playerId={playerId!}
              />
            )}
            {isCreator && (
              <Button type="button" variant="destructive" onClick={handleClear}>
                Clear Room
              </Button>
            )}
          </div>
        </header>

        {error && (
          <div data-testid="error-banner" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2">
          {seats.map((player, index) => {
            const seat = index + 1
            return (
              <div key={seat} className="rounded-md border bg-card p-4">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Seat
                  {' '}
                  {seat}
                </div>
                {player
                  ? (
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <span className="font-medium">{player.name}</span>
                        <span
                          className={
                            player.connected
                              ? 'text-sm text-green-600'
                              : 'text-sm text-muted-foreground'
                          }
                        >
                          {player.connected ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>
                    )
                  : (
                      <div className="mt-2 text-muted-foreground">Waiting...</div>
                    )}
              </div>
            )
          })}
        </section>

        {bothPlayersReady && (
          <div className="rounded-md border bg-card p-4">
            {settings?.autoStart === false
              ? (
                  <>
                    {isCreator
                      ? (
                          <>
                            <p className="text-sm text-muted-foreground">
                              Both players are ready. Start the game when you're ready.
                            </p>
                            <Button
                              type="button"
                              className="mt-3 w-full"
                              onClick={handleStartGame}
                            >
                              Start Game
                            </Button>
                          </>
                        )
                      : (
                          <p className="text-sm text-muted-foreground">
                            Both players are ready. Waiting for the room owner to start the game.
                          </p>
                        )}
                  </>
                )
              : (
                  <p className="text-sm text-muted-foreground">
                    Both players are in the room. The game will start automatically.
                  </p>
                )}
          </div>
        )}

        {settings && (
          <div className="rounded-md border bg-card p-4">
            <h2 className="mb-2 text-sm font-semibold">Game Settings</h2>
            <p className="text-sm text-muted-foreground">
              {settings.timerSeconds === 0 ? 'Unlimited' : `${settings.timerSeconds}s`}
              {' · '}
              {settings.autoStart ? 'Auto-start' : 'Manual start'}
              {' · '}
              {settings.allowFoul ? 'Foul allowed' : 'No foul'}
              {' · '}
              {settings.showHandStrength ? 'Hand strength visible' : 'Hand strength hidden'}
              {' · '}
              {settings.revealOnSubmit ? 'Reveal on submit' : 'Hidden until both submit'}
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
