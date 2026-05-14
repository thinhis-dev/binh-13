import { memo, type ReactNode } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Card as CardType } from '@binh-13/shared'
import { cn } from '@/lib/utils'
import { RANK_LABEL, RED_SUITS, SUIT_LABEL, SUIT_SYMBOL } from '@/lib/cards'
import type { DragData, DragSource } from '@/lib/dnd'

type CardProps = {
  card: CardType
  selected?: boolean
  onClick?: () => void
  size?: 'sm' | 'md'
  dragSource?: DragSource
  highlight?: 'win' | 'lose'
}

const sizeClass = {
  sm: 'h-24 w-16',
  md: 'h-32 w-[5.5rem]',
}

function CardComponent({
  card,
  selected = false,
  onClick,
  size = 'md',
  dragSource,
  highlight,
}: CardProps) {
  const isRed = RED_SUITS.has(card.suit)
  const rank = RANK_LABEL[card.rank]
  const suit = SUIT_SYMBOL[card.suit]
  const label = `${rank} of ${SUIT_LABEL[card.suit]}`

  const baseClass = cn(
    'shrink-0 rounded-md border border-border bg-card shadow-sm',
    sizeClass[size],
    isRed ? 'text-red-600' : 'text-foreground',
    selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
    highlight === 'win' && 'ring-2 ring-green-500 ring-offset-1',
    highlight === 'lose' && 'ring-2 ring-red-500 ring-offset-1',
  )

  const svgContent = (
    <svg viewBox="0 0 72 104" aria-hidden="true" className="h-full w-full">
      <rect
        x="2"
        y="2"
        width="68"
        height="100"
        rx="6"
        fill="currentColor"
        opacity="0.06"
      />
      <rect x="3" y="3" width="66" height="98" rx="6" fill="white" />
      <text x="9" y="18" fontSize="13" fontWeight="700" fill="currentColor">
        {rank}
      </text>
      <text x="10" y="34" fontSize="15" fill="currentColor">
        {suit}
      </text>
      <text
        x="36"
        y="60"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="30"
        fill="currentColor"
      >
        {suit}
      </text>
      <g transform="rotate(180 36 52)">
        <text x="9" y="18" fontSize="13" fontWeight="700" fill="currentColor">
          {rank}
        </text>
        <text x="10" y="34" fontSize="15" fill="currentColor">
          {suit}
        </text>
      </g>
    </svg>
  )

  if (onClick) {
    return (
      <InteractiveCard
        card={card}
        dragSource={dragSource}
        label={label}
        baseClass={baseClass}
        onClick={onClick}
      >
        {svgContent}
      </InteractiveCard>
    )
  }

  return (
    <div
      role="img"
      aria-label={label}
      data-testid="playing-card"
      className={cn(baseClass, 'cursor-default')}
    >
      {svgContent}
    </div>
  )
}

type InteractiveCardProps = {
  card: CardType
  dragSource?: DragSource
  label: string
  baseClass: string
  onClick: () => void
  children: ReactNode
}

function InteractiveCard({
  card,
  dragSource,
  label,
  baseClass,
  onClick,
  children,
}: InteractiveCardProps) {
  const dragData: DragData | undefined = dragSource
    ? { card, source: dragSource }
    : undefined
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: card.id,
      data: dragData,
      disabled: !dragSource,
    })

  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-label={label}
      data-testid="playing-card"
      onClick={onClick}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        baseClass,
        'touch-none p-0 transition focus-visible:ring-2 focus-visible:ring-ring',
        dragSource && 'cursor-grab active:cursor-grabbing',
        !isDragging && 'hover:-translate-y-0.5 hover:shadow-md',
        isDragging && 'opacity-40',
      )}
      {...listeners}
      {...attributes}
    >
      {children}
    </button>
  )
}

export const Card = memo(CardComponent)
