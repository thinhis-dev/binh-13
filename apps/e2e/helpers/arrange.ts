import type { Card, Rank, Suit } from '@binh-13/shared'
import type { Page } from '@playwright/test'
import type { GroupKey } from './selectors'
import { expect } from '@playwright/test'
import { startGameForBoth } from './room'
import { boardCards, cardOnBoard, dropTarget, rowCards, submitArrangementButton } from './selectors'
import { quickFoulCheck, RANK_VALUE } from './shared'

export interface Arrangement {
  group1: Card[] // Back (5)
  group2: Card[] // Middle (5)
  group3: Card[] // Front (3)
}

function cardFromId(id: string): Card {
  return { id, rank: id[0] as Rank, suit: id[1] as Suit }
}

const GROUP_KEYS: GroupKey[] = ['group1', 'group2', 'group3']
const ROW_SIZE: Record<GroupKey, number> = { group1: 5, group2: 5, group3: 3 }

export type Board = Record<GroupKey, string[]>

/**
 * Reads the card ids of each row from the DOM via `data-card-id` (no fixed seed to assert
 * against). `evaluateAll` itself doesn't auto-wait, so the count assertions come first: without
 * them this can race the initial deal render and silently return `[]` right after navigating.
 */
export async function readBoard(page: Page): Promise<Board> {
  const board = {} as Board
  for (const key of GROUP_KEYS) {
    const cards = rowCards(page, key)
    await expect(cards).toHaveCount(ROW_SIZE[key])
    board[key] = await cards.evaluateAll(elements => elements.map(el => el.getAttribute('data-card-id') as string))
  }
  return board
}

/** All 13 dealt card ids, Back row first. */
export async function readHandCardIds(page: Page): Promise<string[]> {
  await expect(boardCards(page)).toHaveCount(13)
  const board = await readBoard(page)
  return [...board.group1, ...board.group2, ...board.group3]
}

/** The board after a swap of cards a and b. */
function swapped(board: Board, a: string, b: string): Board {
  const swap = (id: string) => (id === a ? b : id === b ? a : id)
  return {
    group1: board.group1.map(swap),
    group2: board.group2.map(swap),
    group3: board.group3.map(swap),
  }
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

/**
 * Real pointer drag of one card onto another — dnd-kit's PointerSensor uses an 8px
 * activation distance, so the helper must move past that before it picks the card up.
 * Playwright's locator.dragTo()/page.dragAndDrop() do not work here (pointer, not HTML5 DnD).
 * Repeated pointer drags are unreliable in this sandboxed Chromium: after a drop, dnd-kit
 * only re-activates behind an unexplained ~1s delay with no DOM-observable condition to poll
 * for. So only single-swap specs use this; full arrangements use swapByKeyboard.
 */
export async function swapByPointer(page: Page, a: string, b: string) {
  const expected = swapped(await readBoard(page), a, b)
  const from = await cardOnBoard(page, a).boundingBox()
  const to = await cardOnBoard(page, b).boundingBox()
  if (!from || !to)
    throw new Error('swapByPointer: missing bounding box for a card')

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2)
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => readBoard(page)).toEqual(expected)
}

/**
 * Keyboard drag: Space picks card a up, each arrow key jumps the dragged card to the next
 * card in that direction (see apps/web/src/lib/dndKeyboard.ts), and Space drops it on card b.
 * The helper first moves to the row of b, then along that row, and waits for the highlighted
 * drop target to change after each key press. The board sets an instant keyboard scroll, so
 * a jump that scrolls the page is finished before the next key press.
 */
export async function swapByKeyboard(page: Page, a: string, b: string) {
  const expected = swapped(await readBoard(page), a, b)
  const target = await cardOnBoard(page, b).boundingBox()
  if (!target)
    throw new Error('swapByKeyboard: missing bounding box for the target card')
  const targetX = target.x + target.width / 2
  const targetY = target.y + target.height / 2

  await cardOnBoard(page, a).focus()
  await page.keyboard.press('Space')
  await expect(cardOnBoard(page, a)).toHaveAttribute('aria-pressed', 'true')
  // dnd-kit's KeyboardSensor adds its keydown listener in a setTimeout(0) after activation,
  // and Chromium can dispatch an input event before that timer runs, which loses the key.
  // Timers with the same delay run in order, so this one resolves after the listener exists.
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)))

  let current = a
  for (let step = 0; current !== b; step++) {
    if (step > 20)
      throw new Error(`swapByKeyboard: could not reach ${b} from ${a}`)
    const box = await cardOnBoard(page, current).boundingBox()
    if (!box)
      throw new Error('swapByKeyboard: missing bounding box for the current card')
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    const key = Math.abs(y - targetY) > box.height / 2
      ? (y > targetY ? 'ArrowUp' : 'ArrowDown')
      : (x > targetX ? 'ArrowLeft' : 'ArrowRight')

    await page.keyboard.press(key)
    await expect(dropTarget(page)).toHaveCount(1)
    await expect(dropTarget(page)).not.toHaveAttribute('data-card-id', current)
    current = await dropTarget(page).getAttribute('data-card-id') as string
  }

  await page.keyboard.press('Space')
  await expect.poll(() => readBoard(page)).toEqual(expected)
}

/** Swaps the wanted card into each of the 13 positions in turn: at most 12 swaps. */
export async function arrangeBySwaps(page: Page, arrangement: Arrangement) {
  for (const key of GROUP_KEYS) {
    for (const [index, card] of arrangement[key].entries()) {
      const board = await readBoard(page)
      const current = board[key][index]
      if (current !== card.id)
        await swapByKeyboard(page, current, card.id)
    }
  }
}

export async function submitArrangement(page: Page) {
  await submitArrangementButton(page).click()
}

/**
 * The crown-jewel helper: deals both players in, arranges + submits a valid hand for each,
 * and waits for the result page. This is the one expensive full-round path — every other
 * spec that needs a finished round reuses it instead of re-deriving the swap sequence.
 */
export async function playFullRound(p1: Page, p2: Page): Promise<string> {
  const code = await startGameForBoth(p1, p2)

  for (const page of [p1, p2]) {
    const cardIds = await readHandCardIds(page)
    const arrangement = computeValidArrangement(cardIds)
    await arrangeBySwaps(page, arrangement)
    await submitArrangement(page)
  }

  await expect(p1).toHaveURL(new RegExp(`/room/${code}/result$`))
  await expect(p2).toHaveURL(new RegExp(`/room/${code}/result$`))
  return code
}
