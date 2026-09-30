import type { ClientRect } from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'
import { cardKeyboardCoordinates } from '@/lib/dndKeyboard'

function rect(left: number, top: number, width = 40, height = 60): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

// Two rows: Front (F1 F2 F3) above Back (B1 B2 B3 B4).
const RECTS = new Map<string, ClientRect>([
  ['F1', rect(40, 0)],
  ['F2', rect(90, 0)],
  ['F3', rect(140, 0)],
  ['B1', rect(0, 100)],
  ['B2', rect(50, 100)],
  ['B3', rect(100, 100)],
  ['B4', rect(150, 100)],
])

function press(code: string, from: ClientRect) {
  const event = new KeyboardEvent('keydown', { code })
  return cardKeyboardCoordinates(event, {
    active: 'B2',
    currentCoordinates: { x: from.left, y: from.top },
    context: { collisionRect: from, droppableRects: RECTS } as never,
  })
}

/** Top-left that centers a 40 x 60 dragged card on the card with this id. */
function centeredOn(id: string) {
  const target = RECTS.get(id) as ClientRect
  return { x: target.left, y: target.top }
}

describe('cardKeyboardCoordinates', () => {
  it('moves right and left to the next card in the same row', () => {
    expect(press('ArrowRight', rect(50, 100))).toEqual(centeredOn('B3'))
    expect(press('ArrowLeft', rect(50, 100))).toEqual(centeredOn('B1'))
  })

  it('moves up and down to the nearest card in the next row', () => {
    expect(press('ArrowUp', rect(50, 100))).toEqual(centeredOn('F1'))
    expect(press('ArrowDown', rect(140, 0))).toEqual(centeredOn('B4'))
  })

  it('returns undefined at the edge of the board', () => {
    expect(press('ArrowLeft', rect(0, 100))).toBeUndefined()
    expect(press('ArrowDown', rect(0, 100))).toBeUndefined()
    expect(press('ArrowUp', rect(90, 0))).toBeUndefined()
  })

  it('returns undefined for keys that are not arrows', () => {
    expect(press('KeyA', rect(50, 100))).toBeUndefined()
  })
})
