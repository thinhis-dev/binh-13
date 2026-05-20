import { useCallback, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GameBoard } from '@/components/game/GameBoard'
import { useSocket } from '@/hooks/useSocket'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'

export default function Game() {
  const hand = useGameStore(state => state.hand)
  const result = useGameStore(state => state.result)
  const submitted = useGameStore(state => state.submitted)
  const navigate = useNavigate()
  const { code } = useParams<{ code: string }>()
  const { surrender } = useSocket()
  const playerId = useSessionStore(s => s.playerId)

  useEffect(() => {
    if (result) {
      navigate(`/room/${code}/result`, { replace: true })
    }
  }, [result, navigate, code])

  const handleSurrender = useCallback(() => {
    if (playerId && code) {
      surrender(playerId, code)
    }
  }, [playerId, code, surrender])

  if (hand.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Waiting for cards to be dealt…</p>
      </div>
    )
  }

  return <GameBoard initialCards={hand} onSurrender={handleSurrender} surrenderDisabled={submitted} />
}
