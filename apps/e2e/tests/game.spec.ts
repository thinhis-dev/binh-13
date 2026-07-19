import type { Rank } from '@binh-13/shared'
import { expect } from '@playwright/test'
import { test } from '../fixtures/players'
import {
  assignArrangementByClick,
  computeFoulArrangement,
  computeValidArrangement,
  dragCardToGroup,
  readHandCardIds,
  removeCardFromGroup,
  submitArrangement,
} from '../helpers/arrange'
import { startGameForBoth } from '../helpers/room'
import {
  foulWarning,
  groupSlot,
  handCards,
  opponentSubmittedIndicator,
  selfSubmittedIndicator,
  sortButton,
  submitArrangementButton,
} from '../helpers/selectors'
import { RANK_VALUE } from '../helpers/shared'

test.describe('arrangement & submit', () => {
  test('deal — 13 cards each, empty groups, submit disabled', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    for (const page of [p1, p2]) {
      await expect(handCards(page)).toHaveCount(13)
      await expect(groupSlot(page, 'group1')).toContainText('0 / 5 cards')
      await expect(groupSlot(page, 'group2')).toContainText('0 / 5 cards')
      await expect(groupSlot(page, 'group3')).toContainText('0 / 3 cards')
      await expect(submitArrangementButton(page)).toBeDisabled()
    }
  })

  test('sort orders the hand by rank descending', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    const before = await readHandCardIds(p1)
    await sortButton(p1).click()
    const after = await readHandCardIds(p1)

    expect(after).not.toEqual(before)
    expect(after).toHaveLength(13)
    const ranks = after.map(id => RANK_VALUE[id[0] as Rank])
    for (let i = 1; i < ranks.length; i++)
      expect(ranks[i]).toBeLessThanOrEqual(ranks[i - 1])
  })

  test('drag a card into a group, then remove it back to hand', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    const [cardId] = await readHandCardIds(p1)
    await dragCardToGroup(p1, cardId, 'group3')
    await expect(handCards(p1)).toHaveCount(12)

    // Removal uses the click-to-remove path (see removeCardFromGroup) rather than a reverse
    // drag — see helpers/arrange.ts for why the raw pointer-drag-out direction was dropped.
    await removeCardFromGroup(p1, cardId, 'group3')
    await expect(handCards(p1)).toHaveCount(13)
  })

  test('submit stays disabled until all 13 cards are placed', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    const cardIds = await readHandCardIds(p1)
    const arrangement = computeValidArrangement(cardIds)
    // Place everything except the last Front card.
    const partial = {
      group1: arrangement.group1,
      group2: arrangement.group2,
      group3: arrangement.group3.slice(0, 2),
    }
    await assignArrangementByClick(p1, partial)
    await expect(submitArrangementButton(p1)).toBeDisabled()

    await assignArrangementByClick(p1, { group1: [], group2: [], group3: arrangement.group3.slice(2) })
    await expect(submitArrangementButton(p1)).toBeEnabled()
  })

  test('foul warning appears for a deliberately weak Back / strong Middle split', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    const cardIds = await readHandCardIds(p1)
    const arrangement = computeFoulArrangement(cardIds)
    await assignArrangementByClick(p1, arrangement)

    await expect(foulWarning(p1)).toBeVisible()
    await expect(submitArrangementButton(p1)).toBeDisabled()
  })

  test('full round — both submit, see the opponent-submitted indicator, then reach result', async ({ p1, p2 }) => {
    await startGameForBoth(p1, p2)

    const p1Arrangement = computeValidArrangement(await readHandCardIds(p1))
    await assignArrangementByClick(p1, p1Arrangement)
    await submitArrangement(p1)

    await expect(selfSubmittedIndicator(p1)).toBeVisible()
    await expect(opponentSubmittedIndicator(p2)).toBeVisible()

    const p2Arrangement = computeValidArrangement(await readHandCardIds(p2))
    await assignArrangementByClick(p2, p2Arrangement)
    await submitArrangement(p2)

    await expect(p1).toHaveURL(/\/room\/[A-Z0-9]{6}\/result$/)
    await expect(p2).toHaveURL(/\/room\/[A-Z0-9]{6}\/result$/)
  })
})
