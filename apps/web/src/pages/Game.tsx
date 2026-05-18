import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { GameBoard } from '@/components/game/GameBoard'
import { useGameStore } from '@/stores/gameStore'

export default function Game() {
  const hand = useGameStore(state => state.hand)
  const result = useGameStore(state => state.result)
  const navigate = useNavigate()
  const { code } = useParams<{ code: string }>()

  useEffect(() => {
    if (result) {
      navigate(`/room/${code}/result`, { replace: true })
    }
  }, [result, navigate, code])

  if (hand.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Waiting for cards to be dealt…</p>
      </div>
    )
  }

  return <GameBoard initialCards={hand} />
}
