import type { Card } from '@binh-13/shared'
import type { GroupKey } from '@/hooks/useArrangement'

export type DragSource = 'hand' | GroupKey

export interface DragData {
  card: Card
  source: DragSource
}

export function isDragSource(value: unknown): value is DragSource {
  return (
    value === 'hand'
    || value === 'group1'
    || value === 'group2'
    || value === 'group3'
  )
}
