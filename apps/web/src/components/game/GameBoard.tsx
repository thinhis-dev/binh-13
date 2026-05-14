import { useCallback, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { Card as CardType } from '@binh-13/shared'
import { Card } from '@/components/card/Card'
import { Button } from '@/components/ui/button'
import { GroupPanel } from '@/components/game/GroupPanel'
import { HandArea } from '@/components/game/HandArea'
import { OpponentArea } from '@/components/game/OpponentArea'
import { type GroupKey, useArrangement } from '@/hooks/useArrangement'
import { type DragData, isDragSource } from '@/lib/dnd'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useSocket } from '@/hooks/useSocket'

type GameBoardProps = {
  initialCards: CardType[]
}

export function GameBoard({ initialCards }: GameBoardProps) {
  const [activeCard, setActiveCard] = useState<CardType | null>(null)
  const [overGroupKey, setOverGroupKey] = useState<GroupKey | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor),
  )

  const timerSeconds = useGameStore((s) => s.timerSeconds)
  const timerExpired = useGameStore((s) => s.timerExpired)
  const submitted = useGameStore((s) => s.submitted)
  const setSubmitted = useGameStore((s) => s.setSubmitted)
  const opponentSubmitted = useGameStore((s) => s.opponentSubmitted)
  const roomCode = useSessionStore((s) => s.roomCode)
  const playerId = useSessionStore((s) => s.playerId)
  const { submitArrangement } = useSocket()

  const {
    hand,
    group1,
    group2,
    group3,
    selectedCardId,
    selectCard,
    assignToGroup,
    removeFromGroup,
    moveToGroup,
    isComplete,
    frontLabel,
    hasFoulWarning,
  } = useArrangement(initialCards)

  const selectedCard = hand.find((card) => card.id === selectedCardId) ?? null

  const handleHandCardClick = useCallback(
    (card: CardType) => {
      selectCard(card.id)
    },
    [selectCard],
  )

  const handleSlotClick = useCallback(
    (groupKey: GroupKey) => {
      if (!selectedCard) return
      assignToGroup(groupKey, selectedCard)
    },
    [assignToGroup, selectedCard],
  )

  const handleGroupCardClick = useCallback(
    (groupKey: GroupKey, card: CardType) => {
      removeFromGroup(groupKey, card)
    },
    [removeFromGroup],
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined
    setActiveCard(data?.card ?? null)
  }, [])

  const handleDragOver = useCallback(
    (event: { over: { id: unknown } | null }) => {
      const id = event.over?.id
      setOverGroupKey(
        isDragSource(id) && id !== 'hand' ? (id as GroupKey) : null,
      )
    },
    [],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCard(null)
      setOverGroupKey(null)

      const destination = event.over?.id
      if (!isDragSource(destination)) return

      const data = event.active.data.current as DragData | undefined
      if (!data || !isDragSource(data.source)) return

      const { card, source } = data
      if (source === destination) return

      if (source === 'hand') {
        // hand → group: assignToGroup enforces capacity internally
        if (destination !== 'hand') {
          assignToGroup(destination, card)
        }
        return
      }

      if (destination === 'hand') {
        // group → hand
        removeFromGroup(source, card)
        return
      }

      // group → different group: single atomic update
      moveToGroup(source, destination, card)
    },
    [assignToGroup, moveToGroup, removeFromGroup],
  )

  const handleDragCancel = useCallback(() => {
    setActiveCard(null)
    setOverGroupKey(null)
  }, [])

  const handleSubmit = useCallback(() => {
    if (!isComplete || !playerId || !roomCode || submitted || timerExpired)
      return
    submitArrangement(playerId, roomCode, { group1, group2, group3 })
    setSubmitted(true)
  }, [
    isComplete,
    playerId,
    roomCode,
    submitted,
    timerExpired,
    setSubmitted,
    submitArrangement,
    group1,
    group2,
    group3,
  ])

  const timerColor =
    timerSeconds <= 10
      ? 'text-red-500 animate-pulse'
      : timerSeconds <= 30
        ? 'text-yellow-500'
        : 'text-muted-foreground'

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex items-center justify-between">
          <OpponentArea opponentSubmitted={opponentSubmitted} />
          {timerSeconds > 0 && (
            <span className={`text-lg font-mono font-semibold ${timerColor}`}>
              ⏱ {timerSeconds}s
            </span>
          )}
        </header>

        {hasFoulWarning && (
          <div className="rounded border border-yellow-500 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            ⚠ Possible foul: Middle group may be stronger than Back group
          </div>
        )}

        {timerExpired && !submitted && (
          <div className="rounded border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800">
            ⏰ Time's up! Your arrangement was auto-submitted as a forfeit.
          </div>
        )}

        <main className="flex flex-1 flex-col gap-4 lg:flex-row">
          <div className="min-w-0 flex-1">
            <HandArea
              cards={hand}
              selectedCardId={selectedCardId}
              onCardClick={handleHandCardClick}
            />
          </div>
          <GroupPanel
            group1={group1}
            group2={group2}
            group3={group3}
            selectedCardId={selectedCardId}
            onSlotClick={handleSlotClick}
            onCardClick={handleGroupCardClick}
            isOver={{
              group1: overGroupKey === 'group1',
              group2: overGroupKey === 'group2',
              group3: overGroupKey === 'group3',
            }}
            frontLabel={frontLabel}
          />
        </main>

        <footer className="flex items-center justify-center gap-4 border-t pt-4">
          {submitted && (
            <span className="text-sm text-muted-foreground">
              Arrangement submitted — waiting for opponent…
            </span>
          )}
          <Button
            type="button"
            size="lg"
            disabled={
              !isComplete || submitted || hasFoulWarning || timerExpired
            }
            onClick={handleSubmit}
          >
            Submit Arrangement
          </Button>
        </footer>
      </div>

      <DragOverlay>
        {activeCard ? <Card card={activeCard} size="md" /> : null}
      </DragOverlay>
    </DndContext>
  )
}
