import { GameBoard } from '@/components/game/GameBoard'
import { MOCK_HAND } from '@/lib/mockCards'
import { useGameStore } from '@/stores/gameStore'

export default function Game() {
  const hand = useGameStore((state) => state.hand)
  const cards = hand.length > 0 ? hand : MOCK_HAND

  return <GameBoard initialCards={cards} />
}
