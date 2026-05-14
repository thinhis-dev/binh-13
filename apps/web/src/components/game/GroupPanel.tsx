import { memo } from 'react'
import type { Card as CardType } from '@binh-13/shared'
import { GroupSlot } from '@/components/game/GroupSlot'
import type { GroupKey } from '@/hooks/useArrangement'

type GroupPanelProps = {
  group1: CardType[]
  group2: CardType[]
  group3: CardType[]
  selectedCardId: string | null
  onSlotClick: (groupKey: GroupKey) => void
  onCardClick: (groupKey: GroupKey, card: CardType) => void
  isOver?: Partial<Record<GroupKey, boolean>>
  frontLabel?: string | null
}

function GroupPanelComponent({
  group1,
  group2,
  group3,
  selectedCardId,
  onSlotClick,
  onCardClick,
  isOver,
  frontLabel,
}: GroupPanelProps) {
  return (
    <aside className="flex w-full flex-col gap-3 lg:w-md">
      <GroupSlot
        groupKey="group1"
        label="Back (5)"
        capacity={5}
        cards={group1}
        onSlotClick={() => onSlotClick('group1')}
        onCardClick={(card) => onCardClick('group1', card)}
        isActive={Boolean(selectedCardId) && group1.length < 5}
        isOver={isOver?.group1}
      />
      <GroupSlot
        groupKey="group2"
        label="Middle (5)"
        capacity={5}
        cards={group2}
        onSlotClick={() => onSlotClick('group2')}
        onCardClick={(card) => onCardClick('group2', card)}
        isActive={Boolean(selectedCardId) && group2.length < 5}
        isOver={isOver?.group2}
      />
      <GroupSlot
        groupKey="group3"
        label={frontLabel ? `Front (3) — ${frontLabel}` : 'Front (3)'}
        capacity={3}
        cards={group3}
        onSlotClick={() => onSlotClick('group3')}
        onCardClick={(card) => onCardClick('group3', card)}
        isActive={Boolean(selectedCardId) && group3.length < 3}
        isOver={isOver?.group3}
      />
    </aside>
  )
}

export const GroupPanel = memo(GroupPanelComponent)
