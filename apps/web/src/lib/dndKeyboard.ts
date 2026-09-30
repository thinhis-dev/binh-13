import type { ClientRect, KeyboardCoordinateGetter } from '@dnd-kit/core'

type Direction = 'left' | 'right' | 'up' | 'down'

const DIRECTION: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
}

/** The cross-axis distance counts more, so a move stays in its row or column when it can. */
const CROSS_AXIS_WEIGHT = 3

function center(rect: ClientRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/**
 * Keyboard drag that jumps from card to card instead of moving a fixed number of pixels.
 * Each arrow key centers the dragged card on the nearest card droppable in that direction.
 * It returns undefined at the edge of the board, so the card stays where it is.
 */
export const cardKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const direction = DIRECTION[event.code]
  const { collisionRect, droppableRects } = context
  if (!direction || !collisionRect)
    return undefined

  event.preventDefault()
  const origin = center(collisionRect)
  let best: { score: number, rect: ClientRect } | null = null

  for (const rect of droppableRects.values()) {
    const target = center(rect)
    const dx = target.x - origin.x
    const dy = target.y - origin.y
    const horizontal = direction === 'left' || direction === 'right'
    const main = horizontal ? dx : dy
    const cross = horizontal ? dy : dx
    const ahead = direction === 'right' || direction === 'down' ? main > 1 : main < -1
    if (!ahead)
      continue

    const score = Math.abs(main) + Math.abs(cross) * CROSS_AXIS_WEIGHT
    if (!best || score < best.score)
      best = { score, rect }
  }

  if (!best)
    return undefined

  const target = center(best.rect)
  return {
    x: target.x - collisionRect.width / 2,
    y: target.y - collisionRect.height / 2,
  }
}
