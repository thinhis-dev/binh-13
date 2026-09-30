import type { Rank } from '@binh-13/shared'
import { expect } from '@playwright/test'
import { test } from '../fixtures/players'
import {
  arrangeBySwaps,
  computeFoulArrangement,
  computeValidArrangement,
  readBoard,
  readHandCardIds,
  submitArrangement,
  swapByKeyboard,
  swapByPointer,
} from '../helpers/arrange'
import { startGameForBoth } from '../helpers/room'
import {
  foulWarning,
  hintButton,
  opponentSubmittedIndicator,
  rowCards,
  selfSubmittedIndicator,
  sortButton,
  sortedDealSwitch,
  submitArrangementButton,
} from '../helpers/selectors'
import { RANK_VALUE } from '../helpers/shared'

const SUIT_VALUE: Record<string, number> = { S: 4, H: 3, D: 2, C: 1 }

/** Same order as sortCards in apps/web/src/lib/cards.ts: rank descending, then S > H > D > C. */
function sortIds(ids: string[]) {
  return [...ids].sort((a, b) =>
    RANK_VALUE[b[0] as Rank] - RANK_VALUE[a[0] as Rank] || SUIT_VALUE[b[1]] - SUIT_VALUE[a[1]])
}

test.describe('swap board & submit', () => {
  test('deal — 13 cards straight into Front 3, Middle 5, Back 5, no hand area', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    for (const page of [p1, p2]) {
      await expect(rowCards(page, 'group3')).toHaveCount(3)
      await expect(rowCards(page, 'group2')).toHaveCount(5)
      await expect(rowCards(page, 'group1')).toHaveCount(5)
      await expect(page.getByTestId('hand-area')).toHaveCount(0)
      await expect(page.getByTestId('empty-slot')).toHaveCount(0)
    }
  })

  test('pointer drag of a card onto a card in another row swaps them', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    const board = await readBoard(p1)
    await swapByPointer(p1, board.group1[0], board.group3[0])
  })

  test('keyboard drag of a card onto a card in another row swaps them', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    const board = await readBoard(p1)
    await swapByKeyboard(p1, board.group3[2], board.group1[1])
  })

  test('sort orders the cards inside each row without moving them between rows', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    const before = await readBoard(p1)
    await sortButton(p1).click()

    await expect.poll(() => readBoard(p1)).toEqual({
      group1: sortIds(before.group1),
      group2: sortIds(before.group2),
      group3: sortIds(before.group3),
    })
  })

  test('sorted deal preference set before the deal fills the rows in sorted order', async ({ p1, p2 }) => {
    await p1.evaluate(() => localStorage.setItem('binh13.dealOrder', 'sorted'))
    await startGameForBoth(p1, p2)

    await expect(sortedDealSwitch(p1)).toBeChecked()
    const ids = await readHandCardIds(p1)
    expect(ids).toEqual(sortIds(ids))
  })

  test('foul warning appears for a weak Back / strong Middle board and disables submit', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    const arrangement = computeFoulArrangement(await readHandCardIds(p1))
    await arrangeBySwaps(p1, arrangement)

    await expect(foulWarning(p1)).toBeVisible()
    await expect(submitArrangementButton(p1)).toBeDisabled()
  })

  test('hint fills the board with a non-foul arrangement of the same cards', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    const before = await readBoard(p1)
    await hintButton(p1).click()

    await expect.poll(() => readBoard(p1)).not.toEqual(before)
    const after = await readHandCardIds(p1)
    expect([...after].sort()).toEqual([...before.group1, ...before.group2, ...before.group3].sort())
    await expect(foulWarning(p1)).toHaveCount(0)
    await expect(submitArrangementButton(p1)).toBeEnabled()
  })

  test('full round — both arrange by swaps, submit, see the opponent-submitted indicator, then reach result', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    await arrangeBySwaps(p1, computeValidArrangement(await readHandCardIds(p1)))
    await submitArrangement(p1)

    await expect(selfSubmittedIndicator(p1)).toBeVisible()
    await expect(opponentSubmittedIndicator(p2)).toBeVisible()

    await arrangeBySwaps(p2, computeValidArrangement(await readHandCardIds(p2)))
    await submitArrangement(p2)

    await expect(p1).toHaveURL(/\/room\/[A-Z0-9]{6}\/result$/)
    await expect(p2).toHaveURL(/\/room\/[A-Z0-9]{6}\/result$/)
  })
})
