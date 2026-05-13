import { GameBoard } from '@/components/game/GameBoard'
import { useGameStore } from '@/stores/gameStore'

export default function Game() {
  const hand = useGameStore((state) => state.hand)

  if (hand.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Waiting for cards to be dealt…</p>
      </div>
    )
  }

  return <GameBoard initialCards={hand} />
}
