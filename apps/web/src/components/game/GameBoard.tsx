import type { Card as CardType } from '@binh-13/shared'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { DealOrder } from '@/lib/dealOrder'
import type { DragData } from '@/lib/dnd'
import { INSTANT_WIN_NAME } from '@binh-13/shared'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Card } from '@/components/card/Card'
import { GroupPanel } from '@/components/game/GroupPanel'
import { OpponentArea } from '@/components/game/OpponentArea'
import { SurrenderDialog } from '@/components/game/SurrenderDialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useArrangement } from '@/hooks/useArrangement'
import { useSocket } from '@/hooks/useSocket'
import { readDealOrder, writeDealOrder } from '@/lib/dealOrder'
import { cardKeyboardCoordinates } from '@/lib/dndKeyboard'
import { useGameStore } from '@/stores/gameStore'
import { useSessionStore } from '@/stores/sessionStore'

/** Wait after the last board change before the draft goes to the server. */
const DRAFT_DELAY_MS = 300

interface GameBoardProps {
  initialCards: CardType[]
  onSurrender?: () => void
  surrenderDisabled?: boolean
}

export function GameBoard({ initialCards, onSurrender, surrenderDisabled }: GameBoardProps) {
  const [activeCard, setActiveCard] = useState<CardType | null>(null)
  const [dealOrder, setDealOrder] = useState<DealOrder>(readDealOrder)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    // An instant scroll keeps each arrow jump in step with the page. The default smooth
    // scroll lets the next key press read a card position in the middle of the animation.
    useSensor(KeyboardSensor, { coordinateGetter: cardKeyboardCoordinates, scrollBehavior: 'auto' }),
  )

  const timerSeconds = useGameStore(s => s.timerSeconds)
  const timerExpired = useGameStore(s => s.timerExpired)
  const submitted = useGameStore(s => s.submitted)
  const setSubmitted = useGameStore(s => s.setSubmitted)
  const opponentSubmitted = useGameStore(s => s.opponentSubmitted)
  const showHandStrength = useGameStore(s => s.settings?.showHandStrength ?? true)
  const hint = useGameStore(s => s.hint)
  const setHint = useGameStore(s => s.setHint)
  const roomCode = useSessionStore(s => s.roomCode)
  const playerId = useSessionStore(s => s.playerId)
  const { submitArrangement, saveDraft, requestHint } = useSocket()

  // The deal order only matters for the first layout. A change applies from the next deal.
  const {
    group1,
    group2,
    group3,
    swapCards,
    sortRows,
    applyArrangement,
    labels,
    hasFoulWarning,
    instantWin,
  } = useArrangement(initialCards, { order: dealOrder, showHandStrength })

  const isLocked = submitted || timerExpired

  // A hint reply fills the board once.
  useEffect(() => {
    if (!hint)
      return
    applyArrangement(hint)
    setHint(null)
  }, [hint, applyArrangement, setHint])

  // Send the board as a draft after each swap, sort, or hint, so that a timeout can use it.
  // The deal layout itself is not a draft.
  const dealtRowsRef = useRef({ group1, group2, group3 })
  useEffect(() => {
    const dealt = dealtRowsRef.current
    const isDealt = group1 === dealt.group1 && group2 === dealt.group2 && group3 === dealt.group3
    if (isDealt || isLocked || !playerId || !roomCode)
      return
    const timer = setTimeout(() => {
      saveDraft(playerId, roomCode, { group1, group2, group3 })
    }, DRAFT_DELAY_MS)
    return () => clearTimeout(timer)
  }, [group1, group2, group3, isLocked, playerId, roomCode, saveDraft])

  const handleHint = useCallback(() => {
    if (playerId && roomCode)
      requestHint(playerId, roomCode)
  }, [playerId, roomCode, requestHint])

  const handleDealOrderChange = useCallback((sorted: boolean) => {
    const order: DealOrder = sorted ? 'sorted' : 'raw'
    writeDealOrder(order)
    setDealOrder(order)
  }, [])

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined
    setActiveCard(data?.card ?? null)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveCard(null)
      const over = event.over?.id
      if (over === undefined || over === event.active.id)
        return
      swapCards(String(event.active.id), String(over))
    },
    [swapCards],
  )

  const handleDragCancel = useCallback(() => {
    setActiveCard(null)
  }, [])

  // An instant win overrides a foul, so a fouled instant-win board can still be submitted.
  const canSubmit = !isLocked && (!hasFoulWarning || instantWin !== null)

  const handleSubmit = useCallback(() => {
    if (!canSubmit || !playerId || !roomCode)
      return
    submitArrangement(playerId, roomCode, { group1, group2, group3 })
    setSubmitted(true)
  }, [
    canSubmit,
    playerId,
    roomCode,
    setSubmitted,
    submitArrangement,
    group1,
    group2,
    group3,
  ])

  const timerColor
    = timerSeconds <= 10
      ? 'text-red-500 animate-pulse'
      : timerSeconds <= 30
        ? 'text-yellow-500'
        : 'text-muted-foreground'

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-4 p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 max-w-full">
            <OpponentArea opponentSubmitted={opponentSubmitted} />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="sorted-deal"
              checked={dealOrder === 'sorted'}
              onCheckedChange={handleDealOrderChange}
              aria-describedby="sorted-deal-help"
            />
            <Label htmlFor="sorted-deal">Sorted deal</Label>
            <span id="sorted-deal-help" className="text-xs text-muted-foreground">
              Applies from the next deal.
            </span>
          </div>
          {timerSeconds > 0 && (
            <span className={`text-lg font-mono font-semibold ${timerColor}`}>
              ⏱
              {' '}
              {timerSeconds}
              s
            </span>
          )}
        </header>

        {hasFoulWarning && (
          <div className="rounded border border-yellow-500 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
            ⚠ Possible foul: Middle group may be stronger than Back group
            {instantWin && '. Your instant win overrides the foul.'}
          </div>
        )}

        {timerExpired && !submitted && (
          <div className="rounded border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800">
            ⏰ Time's up! Your board was auto-arranged and submitted.
          </div>
        )}

        <main className="flex flex-1 flex-col items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Drag a card onto another card to swap them.
          </p>
          {instantWin && (
            <span
              data-testid="instant-win-badge"
              className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900"
            >
              {`Instant win: ${INSTANT_WIN_NAME[instantWin]}`}
            </span>
          )}
          <GroupPanel group1={group1} group2={group2} group3={group3} labels={labels} />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={sortRows}>
              Sort
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isLocked} onClick={handleHint}>
              Hint
            </Button>
          </div>
        </main>

        <footer className="flex items-center justify-center gap-4 border-t pt-4">
          {submitted && (
            <span data-testid="self-submitted" className="text-sm text-muted-foreground">
              Arrangement submitted — waiting for opponent…
            </span>
          )}
          <Button
            type="button"
            size="lg"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            Submit Arrangement
          </Button>
          {onSurrender && (
            <SurrenderDialog onSurrender={onSurrender} disabled={surrenderDisabled} />
          )}
        </footer>
      </div>

      <DragOverlay>
        {activeCard ? <Card card={activeCard} size="sm" /> : null}
      </DragOverlay>
    </DndContext>
  )
}
