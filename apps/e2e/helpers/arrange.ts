import type { Card, Rank, Suit } from '@binh-13/shared'
import type { Page } from '@playwright/test'
import type { GroupKey } from './selectors'
import { expect } from '@playwright/test'
import { startGameForBoth } from './room'
import { cardInGroup, emptySlotIn, handArea, submitArrangementButton } from './selectors'
import { quickFoulCheck, RANK_VALUE } from './shared'

export interface Arrangement {
  group1: Card[] // Back (5)
  group2: Card[] // Middle (5)
  group3: Card[] // Front (3)
}

function cardFromId(id: string): Card {
  return { id, rank: id[0] as Rank, suit: id[1] as Suit }
}

/**
 * Reads the dealt hand's card ids from the DOM via `data-card-id` (no fixed seed to assert
 * against). `evaluateAll` itself doesn't auto-wait, so without the count assertion first this
 * can race the initial deal render and silently return `[]` right after navigating to /game.
 */
export async function readHandCardIds(page: Page): Promise<string[]> {
  const cards = handArea(page).locator('[data-card-id]')
  await expect(cards).toHaveCount(13)
  return cards.evaluateAll(elements => elements.map(el => el.getAttribute('data-card-id') as string))
}

function* combinations<T>(items: T[], size: number): Generator<T[]> {
  if (size === 0) {
    yield []
    return
  }
  if (items.length < size)
    return
  const [first, ...rest] = items
  for (const combo of combinations(rest, size - 1))
    yield [first, ...combo]
  yield* combinations(rest, size)
}

/**
 * Sorts descending by rank, splits Back(5)/Middle(5)/Front(3). A plain top-5/next-5 split can
 * occasionally still foul (quickFoulCheck compares 5-card *categories* — pair/flush/straight —
 * not raw rank, so a lucky pair landing in the "Middle" half can outrank the "Back" half's high
 * cards). Try every 5-from-10 combination (only 252, trivial to compute) of the top 10 cards as
 * Back until one actually passes quickFoulCheck — a bounded rotation isn't exhaustive enough and
 * can occasionally leave every candidate still fouling, stalling the round on a disabled Submit.
 */
export function computeValidArrangement(cardIds: string[]): Arrangement {
  const sorted = cardIds.map(cardFromId).sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank])
  const top10 = sorted.slice(0, 10)
  const group3 = sorted.slice(10, 13)

  for (const group1 of combinations(top10, 5)) {
    const group1Ids = new Set(group1.map(card => card.id))
    const group2 = top10.filter(card => !group1Ids.has(card.id))
    if (quickFoulCheck(group1, group2))
      return { group1, group2, group3 }
  }

  // Fallback if literally no split passes (should not happen) — plain descending split.
  return { group1: top10.slice(0, 5), group2: top10.slice(5, 10), group3 }
}

/**
 * Builds an arrangement `quickFoulCheck` is guaranteed to flag. A plain weakest-5-in-Back /
 * strongest-5-in-Middle split is NOT reliable: quickFoulCheck only detects a *category*
 * difference (pair/flush/straight/etc) — two same-category "High Card" hands are
 * "inconclusive" to it regardless of which one has higher raw ranks. So seed Middle with an
 * actual same-rank pair from the dealt hand (guaranteeing category >= One Pair), then try
 * rotations of the rest until quickFoulCheck actually reports a foul for the split.
 */
export function computeFoulArrangement(cardIds: string[]): Arrangement {
  const cards = cardIds.map(cardFromId)
  const byRank = new Map<string, Card[]>()
  for (const card of cards)
    byRank.set(card.rank, [...(byRank.get(card.rank) ?? []), card])

  const pairGroup = [...byRank.values()].find(group => group.length >= 2)
  const pairCards = pairGroup?.slice(0, 2) ?? []
  const pool = cards.filter(card => !pairCards.includes(card))

  for (let attempt = 0; attempt < pool.length; attempt++) {
    const rotated = [...pool.slice(attempt), ...pool.slice(0, attempt)]
    const group2 = [...pairCards, ...rotated.slice(0, 5 - pairCards.length)]
    const group1 = rotated.slice(5 - pairCards.length, 10 - pairCards.length)
    const group3 = rotated.slice(10 - pairCards.length, 13 - pairCards.length)
    if (!quickFoulCheck(group1, group2))
      return { group1, group2, group3 }
  }

  // Fallback (e.g. no pair anywhere in the dealt hand at all — exceedingly rare for 13 cards).
  const sorted = [...cards].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank])
  return { group1: sorted.slice(5, 10), group2: sorted.slice(0, 5), group3: sorted.slice(10, 13) }
}

/** Click-based placement: select a hand card, then click an empty slot in the target group. */
export async function assignArrangementByClick(page: Page, arrangement: Arrangement) {
  const groups: Array<[GroupKey, Card[]]> = [
    ['group1', arrangement.group1],
    ['group2', arrangement.group2],
    ['group3', arrangement.group3],
  ]

  for (const [groupKey, cards] of groups) {
    for (const card of cards) {
      await handArea(page).locator(`[data-card-id="${card.id}"]`).click()
      await emptySlotIn(page, groupKey).first().click()
      await expect(cardInGroup(page, groupKey, card.id)).toBeVisible()
    }
  }
}

/**
 * Real pointer drag between two droppable regions — dnd-kit's PointerSensor uses an 8px
 * activation distance, so the helper must move past that before it picks the card up.
 * Playwright's locator.dragTo()/page.dragAndDrop() do not work here (pointer, not HTML5 DnD).
 */
async function dragBetween(page: Page, cardLocator: ReturnType<Page['locator']>, targetLocator: ReturnType<Page['locator']>) {
  const from = await cardLocator.boundingBox()
  const to = await targetLocator.boundingBox()
  if (!from || !to)
    throw new Error('dragBetween: missing bounding box for card or drop target')

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2)
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
  await page.mouse.up()
}

export async function dragCardToGroup(page: Page, cardId: string, group: GroupKey) {
  await dragBetween(page, handArea(page).locator(`[data-card-id="${cardId}"]`), emptySlotIn(page, group).first())
  await expect(cardInGroup(page, group, cardId)).toBeVisible()
}

/**
 * Removing a placed card back to hand is also a first-class click interaction (the same
 * click-to-remove path GroupSlot wires up), not just a reverse drag. We rely on it here
 * rather than a reverse pointer-drag: dragging a card back OUT of a group needs dnd-kit to
 * re-settle after the prior drop, and in this sandboxed Chromium that only ever activates
 * reliably behind an unexplained ~1s delay with no DOM-observable condition to poll for —
 * a fixed sleep here would be exactly the kind of flake-prone workaround this project avoids.
 */
export async function removeCardFromGroup(page: Page, cardId: string, fromGroup: GroupKey) {
  await cardInGroup(page, fromGroup, cardId).click()
  await expect(handArea(page).locator(`[data-card-id="${cardId}"]`)).toBeVisible()
}

export async function submitArrangement(page: Page) {
  await submitArrangementButton(page).click()
}

/**
 * The crown-jewel helper: deals both players in, arranges + submits a valid hand for each,
 * and waits for the result page. This is the one expensive full-round path — every other
 * spec that needs a finished round reuses it instead of re-deriving the drag/click sequence.
 */
export async function playFullRound(p1: Page, p2: Page): Promise<string> {
  const code = await startGameForBoth(p1, p2)

  for (const page of [p1, p2]) {
    const cardIds = await readHandCardIds(page)
    const arrangement = computeValidArrangement(cardIds)
    await assignArrangementByClick(page, arrangement)
    await submitArrangement(page)
  }

  await expect(p1).toHaveURL(new RegExp(`/room/${code}/result$`))
  await expect(p2).toHaveURL(new RegExp(`/room/${code}/result$`))
  return code
}
