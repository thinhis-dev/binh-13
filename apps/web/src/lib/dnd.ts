import type { Card } from '@binh-13/shared'
import type { GroupKey } from '@/hooks/useArrangement'

/** Data on a dragged board card: the card and the row it sits in. */
export interface DragData {
  card: Card
  row: GroupKey
}

/** Data on a card that accepts a drop. A drop swaps the dragged card with this card. */
export interface DropData {
  card: Card
}
