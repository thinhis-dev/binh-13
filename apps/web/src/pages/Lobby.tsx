import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EVENTS, type Room, type RoomMessage } from '@binh-13/shared'
import { Button } from '@/components/ui/button'
import { useSocket } from '@/hooks/useSocket'
import { socket } from '@/lib/socket'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'

export default function Lobby() {
  const navigate = useNavigate()
  const params = useParams()
  const code = params.code?.toUpperCase() ?? ''
  const { joinRoom, leaveRoom, clearRoom, sendMessage } = useSocket()
  const playerId = useSessionStore((state) => state.playerId)
  const roomCode = useSessionStore((state) => state.roomCode)
  const setRoomCode = useSessionStore((state) => state.setRoom)
  const room = useGameStore((state) => state.room)
  const setGameRoom = useGameStore((state) => state.setRoom)
  const resetGame = useGameStore((state) => state.reset)
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [messageText, setMessageText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!playerId || !code) {
      navigate('/')
      return
    }

    if (roomCode !== code) setRoomCode(code)
    joinRoom(playerId, code)
  }, [code, joinRoom, navigate, playerId, roomCode, setRoomCode])

  useEffect(() => {
    const handleRoomState = (payload: { room: Room }) => {
      setGameRoom(payload.room)
      setError('')
    }

    const handleRoomMessage = (message: RoomMessage) => {
      setMessages((current) => [...current, message])
    }

    const handleRoomCleared = () => {
      setRoomCode(null)
      resetGame()
      navigate('/')
    }

    const handleRoomLeft = (payload: { playerId: number }) => {
      if (payload.playerId !== playerId) return

      setRoomCode(null)
      resetGame()
      navigate('/')
    }

    const handleError = (payload: { message: string }) => {
      setError(payload.message)
    }

    socket.on(EVENTS.ROOM_STATE, handleRoomState)
    socket.on(EVENTS.ROOM_MESSAGE, handleRoomMessage)
    socket.on(EVENTS.ROOM_LEFT, handleRoomLeft)
    socket.on(EVENTS.ROOM_CLEARED, handleRoomCleared)
    socket.on(EVENTS.ERROR, handleError)

    return () => {
      socket.off(EVENTS.ROOM_STATE, handleRoomState)
      socket.off(EVENTS.ROOM_MESSAGE, handleRoomMessage)
      socket.off(EVENTS.ROOM_LEFT, handleRoomLeft)
      socket.off(EVENTS.ROOM_CLEARED, handleRoomCleared)
      socket.off(EVENTS.ERROR, handleError)
    }
  }, [navigate, playerId, resetGame, setGameRoom, setRoomCode])

  const seats = useMemo(
    () => [1, 2].map((seat) => room?.players.find((player) => player.seat === seat)),
    [room],
  )

  function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = messageText.trim()
    if (!playerId || !code || !trimmed) return

    sendMessage(playerId, code, trimmed)
    setMessageText('')
  }

  function handleLeave() {
    if (!playerId || !code) return

    leaveRoom(playerId, code)
    setRoomCode(null)
    resetGame()
    navigate('/')
  }

  function handleClear() {
    if (!playerId || !code) return
    clearRoom(playerId, code)
  }

  function copyCode() {
    void navigator.clipboard?.writeText(code)
  }

  const isCreator = room?.createdBy === playerId

  return (
    <div className="min-h-screen bg-background p-6">
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Room {code}</h1>
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
            {isCreator && (
              <Button type="button" variant="destructive" onClick={handleClear}>
                Clear Room
              </Button>
            )}
          </div>
        </header>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2">
          {seats.map((player, index) => {
            const seat = index + 1
            return (
              <div key={seat} className="rounded-md border bg-card p-4">
                <div className="text-xs font-medium uppercase text-muted-foreground">
                  Seat {seat}
                </div>
                {player ? (
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
                ) : (
                  <div className="mt-2 text-muted-foreground">Waiting...</div>
                )}
              </div>
            )
          })}
        </section>

        <section className="flex min-h-[360px] flex-col rounded-md border bg-card">
          <div className="border-b px-4 py-3 font-medium">Messages</div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">No messages yet.</p>
            ) : (
              messages.map((message) => (
                <div key={`${message.playerId}-${message.at}`}>
                  <div className="text-xs text-muted-foreground">
                    {message.name} - {new Date(message.at).toLocaleTimeString()}
                  </div>
                  <div className="text-sm">{message.text}</div>
                </div>
              ))
            )}
          </div>
          <form className="flex gap-2 border-t p-4" onSubmit={handleSendMessage}>
            <input
              className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              maxLength={200}
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Type a message"
            />
            <Button type="submit" disabled={!messageText.trim()}>
              Send
            </Button>
          </form>
        </section>
      </main>
    </div>
  )
}
