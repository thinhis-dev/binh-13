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
    console.log({ group1, group2, group3 })
  }, [group1, group2, group3])

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 p-4 sm:p-6">
        <OpponentArea />

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
          />
        </main>

        <footer className="flex justify-center border-t pt-4">
          <Button
            type="button"
            size="lg"
            disabled={!isComplete}
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
