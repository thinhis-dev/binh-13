import type { Card as CardType } from '@binh-13/shared'
import type { GroupKey } from '@/hooks/useArrangement'
import { memo } from 'react'
import { GroupRow } from '@/components/game/GroupRow'

interface GroupPanelProps {
  group1: CardType[]
  group2: CardType[]
  group3: CardType[]
  labels: Record<GroupKey, string | null>
}

/** The board as a pyramid: Front (3) at the top, then Middle (5), then Back (5). */
function GroupPanelComponent({ group1, group2, group3, labels }: GroupPanelProps) {
  return (
    <div data-testid="board" className="flex flex-col items-center gap-3">
      <GroupRow groupKey="group3" label="Front (3)" cards={group3} handName={labels.group3} />
      <GroupRow groupKey="group2" label="Middle (5)" cards={group2} handName={labels.group2} />
      <GroupRow groupKey="group1" label="Back (5)" cards={group1} handName={labels.group1} />
    </div>
  )
}

export const GroupPanel = memo(GroupPanelComponent)
